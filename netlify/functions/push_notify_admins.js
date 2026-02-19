import webpush from 'web-push';
import { getSupabaseServiceConfig } from './_shared/admin-auth.js';

const trim = (value) => String(value || '').trim();

const CORS_HEADERS = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization, x-push-secret',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const toJsonResponse = (statusCode, payload) => ({
  statusCode,
  headers: CORS_HEADERS,
  body: JSON.stringify(payload),
});

const fetchSubscriptions = async () => {
  const { url, serviceRoleKey } = getSupabaseServiceConfig();
  if (!url || !serviceRoleKey) throw new Error('missing_supabase_env');

  const response = await fetch(
    `${url}/rest/v1/admin_push_subscriptions?select=endpoint,p256dh,auth`,
    {
      method: 'GET',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) throw new Error('subscriptions_fetch_failed');
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
};

const deleteSubscription = async (endpoint) => {
  const { url, serviceRoleKey } = getSupabaseServiceConfig();
  if (!url || !serviceRoleKey) return;

  await fetch(
    `${url}/rest/v1/admin_push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`,
    {
      method: 'DELETE',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    }
  );
};

export const handler = async (event) => {
  const method = (event?.httpMethod || 'GET').toUpperCase();
  if (method === 'OPTIONS') return toJsonResponse(200, { ok: true });
  if (method !== 'POST') return toJsonResponse(405, { ok: false, error: 'method_not_allowed' });

  const configuredSecret = trim(process.env.PUSH_NOTIFY_SECRET);
  const providedSecret = trim(
    event?.headers?.['x-push-secret'] || event?.headers?.['X-Push-Secret']
  );
  if (!configuredSecret || providedSecret !== configuredSecret) {
    return toJsonResponse(401, { ok: false, error: 'unauthorized' });
  }

  const vapidPublic = trim(process.env.VAPID_PUBLIC_KEY);
  const vapidPrivate = trim(process.env.VAPID_PRIVATE_KEY);
  const vapidSubject = trim(process.env.VAPID_SUBJECT || 'mailto:admin@p3lending.space');
  if (!vapidPublic || !vapidPrivate) {
    return toJsonResponse(500, { ok: false, error: 'missing_vapid_env' });
  }

  let payload = {};
  try {
    payload = JSON.parse(event?.body || '{}');
  } catch {
    payload = {};
  }

  const title = trim(payload?.title || 'P3 Support');
  const body = trim(payload?.body || 'New customer support message');
  const url = trim(payload?.url || '/?tab=OPERATIONS');
  const threadId = trim(payload?.threadId || '');
  const messageId = trim(payload?.messageId || '');

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  let sent = 0;
  let removed = 0;
  let failed = 0;
  try {
    const subscriptions = await fetchSubscriptions();
    await Promise.all(
      subscriptions.map(async (subscriptionRow) => {
        const subscription = {
          endpoint: subscriptionRow.endpoint,
          keys: {
            p256dh: subscriptionRow.p256dh,
            auth: subscriptionRow.auth,
          },
        };
        try {
          await webpush.sendNotification(
            subscription,
            JSON.stringify({ title, body, url, threadId, messageId })
          );
          sent += 1;
        } catch (error) {
          const statusCode = Number((error && error.statusCode) || 0);
          if (statusCode === 404 || statusCode === 410) {
            removed += 1;
            await deleteSubscription(subscription.endpoint);
            return;
          }
          failed += 1;
        }
      })
    );
  } catch {
    return toJsonResponse(500, { ok: false, error: 'notify_failed' });
  }

  return toJsonResponse(200, { ok: true, sent, removed, failed });
};
