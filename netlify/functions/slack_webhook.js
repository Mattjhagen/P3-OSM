import crypto from 'crypto';

const trim = (value) => String(value || '').trim();

const JSON_HEADERS = {
  'content-type': 'application/json',
};

const toJsonResponse = (statusCode, payload) => ({
  statusCode,
  headers: JSON_HEADERS,
  body: JSON.stringify(payload),
});

const getHeader = (event, name) => {
  const headers = event?.headers || {};
  const lower = name.toLowerCase();
  return headers[lower] || headers[name] || '';
};

const getRawBody = (event) => {
  const body = event?.body || '';
  if (!event?.isBase64Encoded) return body;
  return Buffer.from(body, 'base64').toString('utf8');
};

const isRecentSlackTimestamp = (timestamp) => {
  const tsSeconds = Number.parseInt(String(timestamp), 10);
  if (!Number.isFinite(tsSeconds)) return false;
  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - tsSeconds) <= 60 * 5;
};

const secureCompare = (a, b) => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

const verifySlackSignature = ({ signingSecret, timestamp, signature, rawBody }) => {
  if (!signingSecret || !timestamp || !signature) return false;
  if (!isRecentSlackTimestamp(timestamp)) return false;
  const baseString = `v0:${timestamp}:${rawBody}`;
  const digest = crypto.createHmac('sha256', signingSecret).update(baseString).digest('hex');
  const expectedSignature = `v0=${digest}`;
  return secureCompare(expectedSignature, signature);
};

const parseCommandBody = (rawBody) => {
  const params = new URLSearchParams(rawBody);
  const toObject = {};
  for (const [key, value] of params.entries()) {
    toObject[key] = value;
  }
  return toObject;
};

const getSupabaseConfig = () => ({
  url: trim(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL).replace(/\/+$/, ''),
  serviceRoleKey: trim(process.env.SUPABASE_SERVICE_ROLE_KEY),
});

const fetchLoanStatus = async (loanId) => {
  const { url, serviceRoleKey } = getSupabaseConfig();
  if (!url || !serviceRoleKey) {
    return { ok: false, error: 'missing_supabase_env' };
  }

  const params = new URLSearchParams({
    select: 'id,status,amount_usd,interest_rate,due_date,created_at,updated_at',
    id: `eq.${loanId}`,
    limit: '1',
  });

  const response = await fetch(`${url}/rest/v1/loan_activity?${params.toString()}`, {
    method: 'GET',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return { ok: false, error: `supabase_${response.status}` };
  }

  let rows = [];
  try {
    rows = await response.json();
  } catch {
    rows = [];
  }
  const loan = Array.isArray(rows) ? rows[0] : null;
  if (!loan) return { ok: false, error: 'loan_not_found' };
  return { ok: true, loan };
};

const handleLoanStatusCommand = async (text) => {
  const loanId = trim(text);
  if (!loanId) {
    return {
      response_type: 'ephemeral',
      text: 'Usage: `/loan-status <loan-id>`',
    };
  }

  const result = await fetchLoanStatus(loanId);
  if (!result.ok) {
    if (result.error === 'loan_not_found') {
      return {
        response_type: 'ephemeral',
        text: `No loan found for id \`${loanId}\`.`,
      };
    }
    return {
      response_type: 'ephemeral',
      text: 'Unable to retrieve loan status right now. Try again shortly.',
    };
  }

  const loan = result.loan;
  const dueDate = trim(loan.due_date) ? new Date(loan.due_date).toISOString().slice(0, 10) : 'n/a';
  return {
    response_type: 'ephemeral',
    text: `Loan \`${loan.id}\` is *${loan.status || 'unknown'}*`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Loan Status*\nLoan \`${loan.id}\` is *${loan.status || 'unknown'}*`,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Amount (USD)*\n${loan.amount_usd ?? 'n/a'}` },
          { type: 'mrkdwn', text: `*Interest Rate*\n${loan.interest_rate ?? 'n/a'}%` },
          { type: 'mrkdwn', text: `*Due Date*\n${dueDate}` },
          { type: 'mrkdwn', text: `*Last Updated*\n${trim(loan.updated_at) || trim(loan.created_at) || 'n/a'}` },
        ],
      },
    ],
  };
};

const parseTipCommand = (text) => {
  const tokens = trim(text).split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;

  const recipient = tokens[0];
  const amountToken = tokens[1].replace(/^\$/, '');
  const amount = Number.parseFloat(amountToken);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const message = tokens.slice(2).join(' ');
  return { recipient, amount, message };
};

const handleTipCommand = (text, userName) => {
  const parsed = parseTipCommand(text);
  if (!parsed) {
    return {
      response_type: 'ephemeral',
      text: 'Usage: `/tip @recipient <amount> [message]`',
    };
  }

  const sender = trim(userName) || 'Someone';
  const messageSuffix = parsed.message ? ` — _${parsed.message}_` : '';
  return {
    response_type: 'in_channel',
    text: `:moneybag: ${sender} tipped ${parsed.recipient} *$${parsed.amount.toFixed(2)}*${messageSuffix}`,
  };
};

const handleUnknownCommand = (command) => ({
  response_type: 'ephemeral',
  text: `Unsupported command \`${command}\`. Supported commands: \`/loan-status\`, \`/tip\`.`,
});

export const handler = async (event) => {
  const method = (event?.httpMethod || 'GET').toUpperCase();
  if (method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        ...JSON_HEADERS,
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type, x-slack-signature, x-slack-request-timestamp',
      },
      body: JSON.stringify({ ok: true }),
    };
  }

  if (method !== 'POST') {
    return toJsonResponse(405, { ok: false, error: 'method_not_allowed' });
  }

  const signingSecret = trim(process.env.SLACK_SIGNING_SECRET);
  if (!signingSecret) {
    return toJsonResponse(500, {
      ok: false,
      error: 'missing_slack_signing_secret',
    });
  }

  const rawBody = getRawBody(event);
  const slackSignature = trim(getHeader(event, 'x-slack-signature'));
  const slackTimestamp = trim(getHeader(event, 'x-slack-request-timestamp'));

  const verified = verifySlackSignature({
    signingSecret,
    timestamp: slackTimestamp,
    signature: slackSignature,
    rawBody,
  });

  if (!verified) {
    return toJsonResponse(401, { ok: false, error: 'invalid_signature' });
  }

  const payload = parseCommandBody(rawBody);
  const command = trim(payload.command).toLowerCase();
  const text = trim(payload.text);
  const userName = trim(payload.user_name);

  let responseBody;
  if (command === '/loan-status') {
    responseBody = await handleLoanStatusCommand(text);
  } else if (command === '/tip') {
    responseBody = handleTipCommand(text, userName);
  } else {
    responseBody = handleUnknownCommand(command || 'unknown');
  }

  return toJsonResponse(200, responseBody);
};
