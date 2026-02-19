const trim = (value) => String(value || '').trim();

const CORS_HEADERS = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-allow-methods': 'GET, OPTIONS',
};

const toJsonResponse = (statusCode, payload) => ({
  statusCode,
  headers: CORS_HEADERS,
  body: JSON.stringify(payload),
});

export const handler = async (event) => {
  const method = (event?.httpMethod || 'GET').toUpperCase();
  if (method === 'OPTIONS') return toJsonResponse(200, { ok: true });
  if (method !== 'GET') return toJsonResponse(405, { ok: false, error: 'method_not_allowed' });

  const publicKey = trim(process.env.VAPID_PUBLIC_KEY);
  if (!publicKey) {
    return toJsonResponse(200, { ok: false, error: 'missing_vapid_public_key' });
  }

  return toJsonResponse(200, { ok: true, publicKey });
};
