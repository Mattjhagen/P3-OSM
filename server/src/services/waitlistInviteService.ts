import nodemailer from 'nodemailer';
import { config } from '../config/config';
import { supabase } from '../config/supabase';
import logger from '../utils/logger';

interface WaitlistRow {
  id: string;
  name: string;
  email: string;
  status: 'PENDING' | 'INVITED' | 'ONBOARDED';
  created_at: string;
}

export interface InviteResult {
  id: string;
  email: string;
  status: string;
}

export interface BatchInviteResult {
  requested: number;
  sent: number;
  failed: number;
  failures: Array<{ id: string; email: string; error: string }>;
}

export interface NetlifyWaitlistSyncResult {
  source: 'netlify_forms';
  siteId: string;
  formId: string;
  formName: string;
  scanned: number;
  inserted: number;
  skipped: number;
  syncedAt: string;
}

interface NetlifyForm {
  id: string;
  name?: string;
}

interface NetlifySubmission {
  id: string;
  created_at?: string;
  email?: string;
  data?: Record<string, unknown> | null;
  body?: string;
}

interface WaitlistCandidate {
  email: string;
  name: string;
  createdAt: string;
}

export class WaitlistInviteError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const normalizeEmail = (value: string) => value.trim().toLowerCase();
const normalizeUrl = (value: string) => value.replace(/\/+$/, '');
const trimToString = (value: unknown) => String(value || '').trim();

const NETLIFY_API_BASE_URL = 'https://api.netlify.com/api/v1';
const MAX_NETLIFY_SYNC_PAGES = 50;
const NETLIFY_PAGE_SIZE = 100;

let transporter: nodemailer.Transporter | null = null;

const isSmtpConfigured = () =>
  Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);

const isNetlifySyncConfigured = () =>
  Boolean(config.netlify.apiToken && config.netlify.siteId);

const chooseFirstNonEmpty = (
  source: Record<string, unknown>,
  keys: string[]
): string => {
  for (const key of keys) {
    const value = trimToString(source[key]);
    if (value) return value;
  }
  return '';
};

const getTransporter = () => {
  if (!isSmtpConfigured()) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      requireTLS: true,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
      tls: {
        minVersion: 'TLSv1.2',
      },
    });
  }

  return transporter;
};

const assertAdminCanInvite = async (adminEmail: string) => {
  const normalizedAdminEmail = normalizeEmail(adminEmail);
  if (!normalizedAdminEmail.endsWith('@p3lending.space')) {
    throw new WaitlistInviteError(
      403,
      'Only @p3lending.space admins can send invitations.'
    );
  }

  const { data, error } = await supabase
    .from('employees')
    .select('id,email,is_active')
    .eq('email', normalizedAdminEmail)
    .eq('is_active', true)
    .limit(1);

  if (error) {
    throw new WaitlistInviteError(
      500,
      `Failed to validate admin identity: ${error.message}`
    );
  }

  if (!data || data.length === 0) {
    throw new WaitlistInviteError(403, 'Admin user is not active in employee records.');
  }
};

const requestNetlifyJson = async <T>(path: string): Promise<T> => {
  const token = trimToString(config.netlify.apiToken);

  let response: Response;
  try {
    response = await fetch(`${NETLIFY_API_BASE_URL}${path}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown network error';
    throw new WaitlistInviteError(502, `Failed to reach Netlify API: ${message}`);
  }

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { message: text };
    }
  }

  if (!response.ok) {
    const message =
      trimToString((parsed as any)?.message) ||
      trimToString((parsed as any)?.error) ||
      `Netlify API request failed with status ${response.status}.`;
    throw new WaitlistInviteError(502, message);
  }

  return parsed as T;
};

const resolveWaitlistForm = async (): Promise<{ id: string; name: string }> => {
  const configuredFormId = trimToString(config.netlify.waitlistFormId);
  const desiredName = (trimToString(config.netlify.waitlistFormName) || 'waitlist').toLowerCase();

  if (configuredFormId) {
    const form = await requestNetlifyJson<NetlifyForm>(
      `/forms/${encodeURIComponent(configuredFormId)}`
    );

    return {
      id: trimToString(form?.id) || configuredFormId,
      name: trimToString(form?.name) || desiredName,
    };
  }

  const forms = await requestNetlifyJson<NetlifyForm[]>(
    `/sites/${encodeURIComponent(config.netlify.siteId)}/forms`
  );

  const match =
    (forms || []).find((form) => trimToString(form?.name).toLowerCase() === desiredName) ||
    (forms || []).find((form) => trimToString(form?.name).toLowerCase().includes('waitlist'));

  if (!match?.id) {
    throw new WaitlistInviteError(
      404,
      `Netlify waitlist form '${desiredName}' was not found for the configured site.`
    );
  }

  return {
    id: trimToString(match.id),
    name: trimToString(match.name) || desiredName,
  };
};

const parseBodyData = (body: string): Record<string, string> => {
  if (!body) return {};

  const params = new URLSearchParams(body);
  const result: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }

  return result;
};

const extractWaitlistCandidate = (
  submission: NetlifySubmission
): WaitlistCandidate | null => {
  const data = (submission.data && typeof submission.data === 'object'
    ? submission.data
    : {}) as Record<string, unknown>;
  const bodyData = parseBodyData(trimToString(submission.body));

  const email = normalizeEmail(
    chooseFirstNonEmpty(data, ['email', 'Email', 'email_address', 'emailAddress']) ||
      trimToString(submission.email) ||
      chooseFirstNonEmpty(bodyData, ['email', 'Email'])
  );

  if (!email || !email.includes('@')) {
    return null;
  }

  const fallbackName = email.split('@')[0];
  const name = (
    chooseFirstNonEmpty(data, ['name', 'Name', 'full_name', 'fullName']) ||
    chooseFirstNonEmpty(bodyData, ['name', 'full_name', 'fullName']) ||
    fallbackName
  ).slice(0, 150);

  const createdAtRaw = trimToString(submission.created_at);
  const createdAt = createdAtRaw && !Number.isNaN(Date.parse(createdAtRaw))
    ? createdAtRaw
    : new Date().toISOString();

  return { email, name, createdAt };
};

const loadNetlifyWaitlistSubmissions = async (
  formId: string
): Promise<NetlifySubmission[]> => {
  const submissions: NetlifySubmission[] = [];

  for (let page = 1; page <= MAX_NETLIFY_SYNC_PAGES; page += 1) {
    const chunk = await requestNetlifyJson<NetlifySubmission[]>(
      `/forms/${encodeURIComponent(formId)}/submissions?page=${page}&per_page=${NETLIFY_PAGE_SIZE}`
    );

    if (!Array.isArray(chunk) || chunk.length === 0) {
      break;
    }

    submissions.push(...chunk);

    if (chunk.length < NETLIFY_PAGE_SIZE) {
      break;
    }
  }

  return submissions;
};

const chunk = <T>(items: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
};

const getExistingWaitlistEmails = async (emails: string[]): Promise<Set<string>> => {
  const normalizedUnique = Array.from(new Set(emails.map(normalizeEmail).filter(Boolean)));
  const existing = new Set<string>();

  for (const emailChunk of chunk(normalizedUnique, 250)) {
    const { data, error } = await supabase
      .from('waitlist')
      .select('email')
      .in('email', emailChunk);

    if (error) {
      throw new WaitlistInviteError(
        500,
        `Failed to compare existing waitlist entries: ${error.message}`
      );
    }

    for (const row of data || []) {
      const email = normalizeEmail(trimToString((row as any).email));
      if (email) existing.add(email);
    }
  }

  return existing;
};

const syncWaitlistFromNetlifyInternal = async (): Promise<NetlifyWaitlistSyncResult> => {
  if (!isNetlifySyncConfigured()) {
    throw new WaitlistInviteError(
      503,
      'Netlify waitlist sync is not configured. Set NETLIFY_API_TOKEN and NETLIFY_SITE_ID.'
    );
  }

  const form = await resolveWaitlistForm();
  const submissions = await loadNetlifyWaitlistSubmissions(form.id);

  const candidates = submissions
    .map(extractWaitlistCandidate)
    .filter((candidate): candidate is WaitlistCandidate => Boolean(candidate));

  const uniqueCandidates = new Map<string, WaitlistCandidate>();
  for (const candidate of candidates) {
    if (!uniqueCandidates.has(candidate.email)) {
      uniqueCandidates.set(candidate.email, candidate);
    }
  }

  const candidateList = Array.from(uniqueCandidates.values());
  const existingEmails = await getExistingWaitlistEmails(
    candidateList.map((candidate) => candidate.email)
  );

  const rowsToInsert = candidateList
    .filter((candidate) => !existingEmails.has(candidate.email))
    .map((candidate) => ({
      name: candidate.name,
      email: candidate.email,
      status: 'PENDING',
      created_at: candidate.createdAt,
    }));

  if (rowsToInsert.length > 0) {
    const { error } = await supabase
      .from('waitlist')
      .upsert(rowsToInsert, { onConflict: 'email', ignoreDuplicates: true });

    if (error) {
      throw new WaitlistInviteError(
        500,
        `Failed to persist Netlify waitlist users in Supabase: ${error.message}`
      );
    }
  }

  return {
    source: 'netlify_forms',
    siteId: config.netlify.siteId,
    formId: form.id,
    formName: form.name,
    scanned: candidateList.length,
    inserted: rowsToInsert.length,
    skipped: Math.max(0, candidateList.length - rowsToInsert.length),
    syncedAt: new Date().toISOString(),
  };
};

const getWaitlistEntry = async (waitlistId: string): Promise<WaitlistRow> => {
  const { data, error } = await supabase
    .from('waitlist')
    .select('id,name,email,status,created_at')
    .eq('id', waitlistId)
    .single();

  if (error || !data) {
    throw new WaitlistInviteError(404, 'Waitlist entry was not found.');
  }

  return data as WaitlistRow;
};

const getPendingWaitlistEntries = async (count: number): Promise<WaitlistRow[]> => {
  const { data, error } = await supabase
    .from('waitlist')
    .select('id,name,email,status,created_at')
    .eq('status', 'PENDING')
    .order('created_at', { ascending: true })
    .limit(count);

  if (error) {
    throw new WaitlistInviteError(
      500,
      `Failed to fetch pending waitlist users: ${error.message}`
    );
  }

  return (data || []) as WaitlistRow[];
};

const markInvited = async (waitlistId: string) => {
  const { error } = await supabase
    .from('waitlist')
    .update({ status: 'INVITED' })
    .eq('id', waitlistId);

  if (error) {
    throw new WaitlistInviteError(
      500,
      `Invitation email sent, but failed to update waitlist status: ${error.message}`
    );
  }
};

const sendInviteEmail = async (
  row: WaitlistRow,
  inviteUrl: string,
  adminName: string
) => {
  const smtpTransporter = getTransporter();
  if (!smtpTransporter) {
    throw new WaitlistInviteError(
      503,
      'Invite email service is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS.'
    );
  }

  const greetingName = row.name?.trim() || 'there';
  const senderName = adminName?.trim() || 'P3 Lending Team';
  const fromAddress = config.smtp.from || config.smtp.user;
  const subject = 'You are invited to P3 Lending Beta';
  const text = [
    `Hi ${greetingName},`,
    '',
    `${senderName} invited you to early access on P3 Lending.`,
    `Open your invite link to get started: ${inviteUrl}`,
    '',
    'If you were not expecting this email, you can safely ignore it.',
    '',
    'P3 Lending Team',
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;">
      <p>Hi ${greetingName},</p>
      <p><strong>${senderName}</strong> invited you to early access on P3 Lending.</p>
      <p>
        <a href="${inviteUrl}" style="display:inline-block;padding:10px 14px;background:#00e599;color:#000;text-decoration:none;border-radius:6px;font-weight:700;">
          Open Your Invite
        </a>
      </p>
      <p style="font-size:12px;color:#666;">If you were not expecting this email, you can safely ignore it.</p>
      <p>P3 Lending Team</p>
    </div>
  `;

  await smtpTransporter.sendMail({
    from: fromAddress,
    to: normalizeEmail(row.email),
    subject,
    text,
    html,
  });
};

const buildInviteUrl = (waitlistId: string) =>
  `${normalizeUrl(config.frontendUrl)}/?waitlist_invite=${encodeURIComponent(waitlistId)}`;

const sendSingleInviteInternal = async (
  row: WaitlistRow,
  adminEmail: string,
  adminName: string
): Promise<InviteResult> => {
  if (row.status === 'ONBOARDED') {
    throw new WaitlistInviteError(
      409,
      'This user is already onboarded and does not need an invite.'
    );
  }

  const inviteUrl = buildInviteUrl(row.id);
  await sendInviteEmail(row, inviteUrl, adminName);
  await markInvited(row.id);

  logger.info(
    { waitlistId: row.id, email: row.email, adminEmail, inviteUrl },
    'Waitlist invitation sent'
  );

  return {
    id: row.id,
    email: row.email,
    status: 'INVITED',
  };
};

export const WaitlistInviteService = {
  sendInvite: async (
    waitlistId: string,
    adminEmail: string,
    adminName: string
  ): Promise<InviteResult> => {
    if (!waitlistId || !waitlistId.trim()) {
      throw new WaitlistInviteError(400, 'waitlistId is required.');
    }
    if (!adminEmail || !adminEmail.trim()) {
      throw new WaitlistInviteError(400, 'adminEmail is required.');
    }

    await assertAdminCanInvite(adminEmail);
    const row = await getWaitlistEntry(waitlistId.trim());
    return sendSingleInviteInternal(row, adminEmail, adminName);
  },

  sendBatchInvites: async (
    count: number,
    adminEmail: string,
    adminName: string
  ): Promise<BatchInviteResult> => {
    if (!Number.isFinite(count) || count < 1 || count > 250) {
      throw new WaitlistInviteError(400, 'count must be between 1 and 250.');
    }
    if (!adminEmail || !adminEmail.trim()) {
      throw new WaitlistInviteError(400, 'adminEmail is required.');
    }

    await assertAdminCanInvite(adminEmail);
    const rows = await getPendingWaitlistEntries(Math.floor(count));

    let sent = 0;
    const failures: Array<{ id: string; email: string; error: string }> = [];

    for (const row of rows) {
      try {
        await sendSingleInviteInternal(row, adminEmail, adminName);
        sent += 1;
      } catch (error: any) {
        failures.push({
          id: row.id,
          email: row.email,
          error: error?.message || 'Unknown invite error',
        });
      }
    }

    return {
      requested: Math.floor(count),
      sent,
      failed: failures.length,
      failures,
    };
  },

  syncFromNetlify: async (
    adminEmail: string,
    adminName: string
  ): Promise<NetlifyWaitlistSyncResult> => {
    if (!adminEmail || !adminEmail.trim()) {
      throw new WaitlistInviteError(400, 'adminEmail is required.');
    }

    await assertAdminCanInvite(adminEmail);

    const result = await syncWaitlistFromNetlifyInternal();

    logger.info(
      {
        adminEmail: normalizeEmail(adminEmail),
        adminName: trimToString(adminName) || 'Unknown Admin',
        synced: result.scanned,
        inserted: result.inserted,
        formId: result.formId,
        formName: result.formName,
      },
      'Netlify waitlist sync completed'
    );

    return result;
  },
};
