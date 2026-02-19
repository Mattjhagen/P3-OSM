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
  return toJsonResponse(200, { ok: true, ts: new Date().toISOString() });
};
