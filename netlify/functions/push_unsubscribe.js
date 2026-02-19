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

const removeSubscription = async ({ endpoint, adminUserId }) => {
  const { url, serviceRoleKey } = getSupabaseServiceConfig();
  if (!url || !serviceRoleKey) throw new Error('missing_supabase_env');

  const response = await fetch(
    `${url}/rest/v1/admin_push_subscriptions?endpoint=eq.${encodeURIComponent(
      endpoint
    )}&admin_user_id=eq.${encodeURIComponent(adminUserId)}`,
    {
      method: 'DELETE',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('subscription_delete_failed');
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

  const endpoint = trim(body?.endpoint);
  if (!endpoint) return toJsonResponse(400, { ok: false, error: 'endpoint_required' });

  try {
    await removeSubscription({ endpoint, adminUserId: auth.user.id });
    return toJsonResponse(200, { ok: true });
  } catch {
    return toJsonResponse(500, { ok: false, error: 'subscription_delete_failed' });
  }
};
