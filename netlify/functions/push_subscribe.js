import { getSupabaseServiceConfig, requireAdminAuth } from './_shared/admin-auth.js';

const trim = (value) => String(value || '').trim();

const CORS_HEADERS = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const toJsonResponse = (statusCode, payload) => ({
  statusCode,
  headers: CORS_HEADERS,
  body: JSON.stringify(payload),
});

const upsertSubscription = async (payload) => {
  const { url, serviceRoleKey } = getSupabaseServiceConfig();
  if (!url || !serviceRoleKey) {
    throw new Error('missing_supabase_env');
  }

  const response = await fetch(
    `${url}/rest/v1/admin_push_subscriptions?on_conflict=endpoint`,
    {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([payload]),
    }
  );

  if (!response.ok) {
    throw new Error('subscription_upsert_failed');
  }
};

export const handler = async (event) => {
  const method = (event?.httpMethod || 'GET').toUpperCase();
  if (method === 'OPTIONS') return toJsonResponse(200, { ok: true });
  if (method !== 'POST') return toJsonResponse(405, { ok: false, error: 'method_not_allowed' });

  const auth = await requireAdminAuth(event);
  if (!auth.ok) return toJsonResponse(auth.statusCode || 401, { ok: false, error: auth.error });

  let body = {};
  try {
    body = JSON.parse(event?.body || '{}');
  } catch {
    return toJsonResponse(400, { ok: false, error: 'invalid_body' });
  }

  const subscription = body?.subscription || {};
  const endpoint = trim(subscription?.endpoint);
  const p256dh = trim(subscription?.keys?.p256dh);
  const authKey = trim(subscription?.keys?.auth);
  if (!endpoint || !p256dh || !authKey) {
    return toJsonResponse(400, { ok: false, error: 'invalid_subscription' });
  }

  try {
    await upsertSubscription({
      admin_user_id: auth.user.id,
      admin_email: auth.user.email,
      endpoint,
      p256dh,
      auth: authKey,
      user_agent: trim(event?.headers?.['user-agent'] || event?.headers?.['User-Agent']),
    });
    return toJsonResponse(200, { ok: true });
  } catch {
    return toJsonResponse(500, { ok: false, error: 'subscription_save_failed' });
  }
};
