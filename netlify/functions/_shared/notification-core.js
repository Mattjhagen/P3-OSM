import { createClient } from '@supabase/supabase-js';

const MAX_ERROR_LENGTH = 400;

const trim = (value) => String(value || '').trim();
const normalizeEmail = (value) => trim(value).toLowerCase();

const truncate = (value, max = MAX_ERROR_LENGTH) => {
  const text = trim(value);
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3))}...`;
};

const parseBoolean = (value) => {
  const normalized = trim(value).toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
};

export const toJsonResponse = (statusCode, payload) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});

export const resolveSupabaseConfig = () => {
  const url = trim(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const serviceRoleKey = trim(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return { url, serviceRoleKey };
};

export const createServiceSupabaseClient = () => {
  const { url, serviceRoleKey } = resolveSupabaseConfig();
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

export const createTemplateIdMap = (env = process.env) => ({
  SEC_TRADE_EXECUTED: trim(env.SENDGRID_TEMPLATE_TRADE_ID),
  FIAT_TRANSFER_OUT: trim(env.SENDGRID_TEMPLATE_TRANSFER_ID),
  CRYPTO_TRANSFER_OUT: trim(env.SENDGRID_TEMPLATE_TRANSFER_ID),
  ACCOUNT_SECURITY_CHANGE: trim(env.SENDGRID_TEMPLATE_SECURITY_ID),
  LOAN_DUE_SOON: trim(env.SENDGRID_TEMPLATE_DUE_SOON_ID),
  LOAN_PAYMENT_LATE: trim(env.SENDGRID_TEMPLATE_LATE_ID),
});

export const resolveTemplateId = (templateKey, templateMap) =>
  trim(templateMap?.[trim(templateKey)]);

export const computeBackoffMinutes = (attempts) => {
  const lookup = [1, 5, 15, 60, 360];
  const safeAttempts = Math.max(1, Math.floor(Number(attempts) || 1));
  return lookup[Math.min(lookup.length - 1, safeAttempts - 1)];
};

export const computeNextSendAfterIso = (attempts, baseDate = new Date()) => {
  const next = new Date(baseDate.getTime() + computeBackoffMinutes(attempts) * 60 * 1000);
  return next.toISOString();
};

export const isDryRun = () => parseBoolean(process.env.NOTIFY_DRY_RUN);

export const isScheduledInvocation = (event) => {
  const headers = event?.headers || {};
  const marker = trim(headers['x-nf-event'] || headers['X-Nf-Event']).toLowerCase();
  return marker.includes('schedule');
};

export const isAuthorizedInternalRequest = (event) => {
  if (isScheduledInvocation(event)) return true;
  const secret = trim(process.env.NOTIFY_INTERNAL_SECRET);
  if (!secret) return false;
  const headers = event?.headers || {};
  const authHeader = trim(headers.authorization || headers.Authorization);
  return authHeader === `Bearer ${secret}`;
};

export const createOutboxDbOps = (supabase) => ({
  listPending: async ({ nowIso, limit }) => {
    const { data, error } = await supabase
      .from('notification_outbox')
      .select(
        'id,user_id,to_email,channel,template_key,template_data,status,attempts,send_after,idempotency_key'
      )
      .eq('status', 'pending')
      .lte('send_after', nowIso)
      .order('send_after', { ascending: true })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to query pending outbox rows: ${error.message}`);
    }

    return data || [];
  },

  claimPending: async (id) => {
    const { data, error } = await supabase
      .from('notification_outbox')
      .update({ status: 'sending', last_error: null })
      .eq('id', id)
      .eq('status', 'pending')
      .select(
        'id,user_id,to_email,channel,template_key,template_data,status,attempts,send_after,idempotency_key'
      )
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to claim outbox row '${id}': ${error.message}`);
    }

    return data || null;
  },

  markSent: async (id, sentAtIso) => {
    const { error } = await supabase
      .from('notification_outbox')
      .update({
        status: 'sent',
        sent_at: sentAtIso,
        last_error: null,
      })
      .eq('id', id)
      .eq('status', 'sending');

    if (error) {
      throw new Error(`Failed to mark outbox row '${id}' as sent: ${error.message}`);
    }
  },

  markFailed: async ({ id, attempts, status, sendAfterIso, lastError }) => {
    const nextPayload = {
      attempts,
      status,
      last_error: truncate(lastError),
      send_after: status === 'pending' ? sendAfterIso : new Date().toISOString(),
    };

    const { error } = await supabase
      .from('notification_outbox')
      .update(nextPayload)
      .eq('id', id)
      .eq('status', 'sending');

    if (error) {
      throw new Error(`Failed to update outbox failure state for '${id}': ${error.message}`);
    }
  },
});

export const sendOutboxEmail = async (row, options = {}) => {
  const fetchImpl = options.fetchImpl || fetch;
  const templateMap = options.templateMap || {};
  const templateId = resolveTemplateId(row.template_key, templateMap);
  const sendgridApiKey = trim(process.env.SENDGRID_API_KEY);
  const fromEmail = normalizeEmail(process.env.SENDGRID_FROM_EMAIL);

  if (row.channel !== 'email') {
    throw new Error(`Unsupported notification channel '${row.channel}'.`);
  }

  if (!templateId) {
    throw new Error(`No SendGrid template id configured for '${row.template_key}'.`);
  }

  if (!sendgridApiKey) {
    throw new Error('SENDGRID_API_KEY is not configured.');
  }

  if (!fromEmail) {
    throw new Error('SENDGRID_FROM_EMAIL is not configured.');
  }

  if (isDryRun()) {
    return { dryRun: true };
  }

  const toEmail = normalizeEmail(row.to_email);
  if (!toEmail) {
    throw new Error('Outbox row is missing to_email.');
  }

  const dynamicTemplateData =
    row.template_data && typeof row.template_data === 'object' ? row.template_data : {};

  const response = await fetchImpl('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sendgridApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: { email: fromEmail },
      personalizations: [
        {
          to: [{ email: toEmail }],
          dynamic_template_data: dynamicTemplateData,
          custom_args: {
            outbox_id: row.id,
            idempotency_key: row.idempotency_key || '',
            user_id: row.user_id || '',
          },
        },
      ],
      template_id: templateId,
    }),
  });

  if (response.status >= 200 && response.status < 300) {
    return { accepted: true };
  }

  const body = await response.text();
  throw new Error(`SendGrid delivery failed (${response.status}): ${truncate(body, 250)}`);
};

export const processOutboxBatch = async ({
  dbOps,
  sendEmail,
  now = new Date(),
  limit = 25,
  maxAttempts = 5,
}) => {
  const summary = {
    scanned: 0,
    claimed: 0,
    sent: 0,
    retried: 0,
    failed: 0,
    skipped: 0,
    dryRun: isDryRun(),
  };

  const nowIso = now.toISOString();
  const pendingRows = await dbOps.listPending({ nowIso, limit });
  summary.scanned = pendingRows.length;

  for (const row of pendingRows) {
    const claimed = await dbOps.claimPending(row.id);
    if (!claimed) {
      summary.skipped += 1;
      continue;
    }
    summary.claimed += 1;

    try {
      await sendEmail(claimed);
      await dbOps.markSent(claimed.id, nowIso);
      summary.sent += 1;
    } catch (error) {
      const nextAttempts = Math.max(1, Math.floor(Number(claimed.attempts || 0)) + 1);
      const isTerminal = nextAttempts >= maxAttempts;
      await dbOps.markFailed({
        id: claimed.id,
        attempts: nextAttempts,
        status: isTerminal ? 'failed' : 'pending',
        sendAfterIso: isTerminal ? null : computeNextSendAfterIso(nextAttempts, now),
        lastError: error instanceof Error ? error.message : String(error || 'Unknown send failure'),
      });

      if (isTerminal) {
        summary.failed += 1;
      } else {
        summary.retried += 1;
      }
    }
  }

  return summary;
};
