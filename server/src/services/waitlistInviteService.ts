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
  referral_code?: string | null;
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

export interface ManualInviteResult {
  id: string;
  email: string;
  name: string;
  status: 'INVITED';
  created: boolean;
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
const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const resolveWaitlistDisplayName = (email: string) => trimToString(email.split('@')[0] || 'User').slice(0, 150) || 'User';
const WAITLIST_SELECT_FIELDS = 'id,name,email,status,created_at,referral_code';

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
    const secure = Boolean(config.smtp.secure || Number(config.smtp.port) === 465);
    const requireTLS = !secure && Number(config.smtp.port) === 587;

    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure,
      requireTLS,
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

const escapeHtml = (value: string) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

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
    .select(WAITLIST_SELECT_FIELDS)
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
    .select(WAITLIST_SELECT_FIELDS)
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

const getWaitlistRowsByNormalizedEmail = async (
  normalizedEmail: string
): Promise<WaitlistRow[]> => {
  const { data, error } = await supabase
    .from('waitlist')
    .select(WAITLIST_SELECT_FIELDS)
    .ilike('email', normalizedEmail)
    .order('created_at', { ascending: true });

  if (error) {
    throw new WaitlistInviteError(
      500,
      `Failed to fetch waitlist row by email: ${error.message}`
    );
  }

  return (data || []) as WaitlistRow[];
};

const updateWaitlistName = async (
  waitlistId: string,
  name: string
): Promise<WaitlistRow> => {
  const nextName = trimToString(name).slice(0, 150);
  const { data, error } = await supabase
    .from('waitlist')
    .update({ name: nextName })
    .eq('id', waitlistId)
    .select(WAITLIST_SELECT_FIELDS)
    .single();

  if (error || !data) {
    throw new WaitlistInviteError(
      500,
      `Failed to update waitlist name: ${error?.message || 'Unknown error'}`
    );
  }

  return data as WaitlistRow;
};

const insertWaitlistRow = async (
  normalizedEmail: string,
  name: string
): Promise<WaitlistRow> => {
  const { data, error } = await supabase
    .from('waitlist')
    .insert({
      email: normalizedEmail,
      name,
      status: 'PENDING',
    })
    .select(WAITLIST_SELECT_FIELDS)
    .single();

  if (error || !data) {
    throw new WaitlistInviteError(
      500,
      `Failed to create waitlist entry: ${error?.message || 'Unknown error'}`
    );
  }

  return data as WaitlistRow;
};

const resolveManualInviteRow = async (payload: {
  normalizedEmail: string;
  preferredName: string;
}): Promise<{ row: WaitlistRow; created: boolean }> => {
  const existingRows = await getWaitlistRowsByNormalizedEmail(payload.normalizedEmail);
  if (existingRows.length > 1) {
    logger.warn(
      { duplicateCount: existingRows.length },
      'Multiple waitlist rows detected for a normalized email; using oldest entry.'
    );
  }

  if (existingRows.length > 0) {
    let row = existingRows[0];
    if (payload.preferredName && payload.preferredName !== trimToString(row.name)) {
      row = await updateWaitlistName(row.id, payload.preferredName);
    }
    return { row, created: false };
  }

  try {
    const row = await insertWaitlistRow(payload.normalizedEmail, payload.preferredName);
    return { row, created: true };
  } catch (error: any) {
    if (String(error?.code || '') === '23505' || /duplicate/i.test(String(error?.message || ''))) {
      const rows = await getWaitlistRowsByNormalizedEmail(payload.normalizedEmail);
      if (rows.length > 0) {
        if (rows.length > 1) {
          logger.warn(
            { duplicateCount: rows.length },
            'Duplicate waitlist rows detected after insert conflict; using oldest entry.'
          );
        }
        return { row: rows[0], created: false };
      }
    }
    throw error;
  }
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
  const fromEmail = trimToString(config.smtp.from || config.smtp.user);
  const fromName = trimToString(config.smtp.fromName);
  const fromAddress = fromName && fromEmail ? `${fromName} <${fromEmail}>` : fromEmail;
  const subject = 'You have been invited to join the P3 Protocol';
  const text = [
    `Hi ${greetingName},`,
    '',
    `${senderName} invited you to early access on P3 Securities.`,
    `Open your invite link to get started: ${inviteUrl}`,
    '',
    'If you were not expecting this email, you can safely ignore it.',
    '',
    'P3 Securities',
  ].join('\n');

  const escapedName = escapeHtml(greetingName);
  const escapedSender = escapeHtml(senderName);
  const escapedInviteUrl = escapeHtml(inviteUrl);
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #050505; margin: 0; padding: 0; color: #e4e4e7; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .card { background-color: #18181b; border: 1px solid #27272a; border-radius: 16px; padding: 40px; text-align: center; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5); }
    .logo { font-size: 24px; font-weight: bold; color: #ffffff; letter-spacing: -1px; margin-bottom: 30px; display: inline-block; }
    .logo span { color: #00e599; }
    h1 { color: #ffffff; font-size: 24px; margin-bottom: 16px; letter-spacing: -0.5px; }
    p { font-size: 16px; line-height: 1.6; color: #a1a1aa; margin-bottom: 20px; }
    .btn { background-color: #00e599; color: #000000; font-weight: bold; text-decoration: none; padding: 14px 32px; border-radius: 8px; display: inline-block; text-transform: uppercase; font-size: 14px; letter-spacing: 1px; }
    .footer { margin-top: 32px; font-size: 12px; color: #52525b; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo">P<span>3</span> Securities</div>
      <h1>You're Invited to the Future of Credit.</h1>
      <p>Hi ${escapedName},</p>
      <p><strong>${escapedSender}</strong> invited you to join the P3 Lending Protocol beta.</p>
      <p>Click the button below to accept your invitation and create your decentralized identity.</p>
      <a href="${escapedInviteUrl}" class="btn">Accept Invitation</a>
    </div>
    <div class="footer">
      <p>P3 Lending Protocol • Decentralized Social Finance<br/>
      If you did not expect this invitation, you can safely ignore this email.</p>
    </div>
  </div>
</body>
</html>`;

  await smtpTransporter.sendMail({
    from: fromAddress,
    to: normalizeEmail(row.email),
    subject,
    text,
    html,
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown SMTP delivery error';
    throw new WaitlistInviteError(
      503,
      `Invite email delivery failed: ${message}`
    );
  });
};

const buildInviteUrlForRow = (row: WaitlistRow) => {
  const query = new URLSearchParams();
  query.set('waitlist_invite', String(row.id || ''));
  query.set('email', normalizeEmail(row.email));

  const referralCode = trimToString(row.referral_code || '');
  if (referralCode) {
    query.set('ref', referralCode);
  }

  return `${normalizeUrl(config.frontendUrl)}/auth/invite?${query.toString()}`;
};

const createSupabaseInviteLinkForRow = async (row: WaitlistRow): Promise<string> => {
  const fallbackUrl = buildInviteUrlForRow(row);
  const redirectTo = `${normalizeUrl(config.frontendUrl)}/auth/invite`;
  const email = normalizeEmail(row.email);

  const adminApi: any = (supabase as any)?.auth?.admin;
  if (!adminApi) {
    throw new WaitlistInviteError(500, 'Supabase auth admin client is not available for invites.');
  }

  const generated = await adminApi.generateLink({
    type: 'invite',
    email,
    options: {
      redirectTo,
    },
  });

  const generatedError = generated?.error;
  if (generatedError) {
    throw new WaitlistInviteError(
      503,
      `Failed to generate Supabase invite link: ${generatedError.message || 'unknown error'}`
    );
  }

  const actionLink = trimToString(generated?.data?.properties?.action_link);
  if (actionLink) {
    return actionLink;
  }

  // Fallback path for unexpected response shape.
  return fallbackUrl;
};

const sendSingleInviteInternal = async (
  row: WaitlistRow,
  adminEmail: string,
  adminName: string
): Promise<InviteResult> => {
  const normalizedStatus = String(row.status || 'PENDING').toUpperCase();
  if (normalizedStatus === 'ONBOARDED') {
    throw new WaitlistInviteError(
      409,
      'This user is already onboarded and does not need an invite.'
    );
  }

  const inviteUrl = await createSupabaseInviteLinkForRow(row);
  await sendInviteEmail(row, inviteUrl, adminName);
  if (normalizedStatus === 'PENDING') {
    await markInvited(row.id);
  }

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

  sendManualInvite: async (payload: {
    adminEmail: string;
    adminName: string;
    email: string;
    name?: string;
  }): Promise<ManualInviteResult> => {
    const adminEmail = trimToString(payload.adminEmail);
    const adminName = trimToString(payload.adminName);
    const normalizedEmail = normalizeEmail(payload.email || '');
    const preferredName = trimToString(payload.name || '').slice(0, 150);

    if (!adminEmail) {
      throw new WaitlistInviteError(400, 'adminEmail is required.');
    }
    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      throw new WaitlistInviteError(400, 'A valid invite email is required.');
    }

    await assertAdminCanInvite(adminEmail);

    const resolvedName = preferredName || resolveWaitlistDisplayName(normalizedEmail);
    const { row, created } = await resolveManualInviteRow({
      normalizedEmail,
      preferredName: resolvedName,
    });

    if (String(row.status || '').toUpperCase() === 'ONBOARDED') {
      throw new WaitlistInviteError(
        409,
        'This user is already onboarded and does not need an invite.'
      );
    }

    await sendSingleInviteInternal(row, adminEmail, adminName);

    return {
      id: row.id,
      email: normalizeEmail(row.email),
      name: trimToString(row.name) || resolvedName,
      status: 'INVITED',
      created,
    };
  },
};
