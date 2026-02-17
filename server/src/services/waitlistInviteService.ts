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

export class WaitlistInviteError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const normalizeEmail = (value: string) => value.trim().toLowerCase();
const normalizeUrl = (value: string) => value.replace(/\/+$/, '');

let transporter: nodemailer.Transporter | null = null;

const isSmtpConfigured = () =>
  Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);

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
};
