import {
  generateDekB64,
  unwrapDekFromEscrow,
  wrapDekForEscrow,
} from './_shared/chat-crypto.js';

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

const getSupabaseConfig = () => ({
  url: trim(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL).replace(/\/+$/, ''),
  anonKey: trim(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY),
  serviceRoleKey: trim(process.env.SUPABASE_SERVICE_ROLE_KEY),
});

const getHeader = (event, name) => {
  const headers = event?.headers || {};
  return headers[name] || headers[name.toLowerCase()] || '';
};

const parseBearerToken = (authorizationHeader) => {
  const header = trim(authorizationHeader);
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? trim(match[1]) : '';
};

const supabaseRequest = async ({ path, method = 'GET', body = null, query = '', prefer = '' }) => {
  const { url, serviceRoleKey } = getSupabaseConfig();
  if (!url || !serviceRoleKey) throw new Error('missing_supabase_env');
  const requestUrl = `${url}/rest/v1/${path}${query ? `?${query}` : ''}`;
  return fetch(requestUrl, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
};

const supabaseSelect = async ({ table, query }) => {
  const response = await supabaseRequest({ path: table, method: 'GET', query });
  if (!response.ok) return [];
  try {
    const rows = await response.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
};

const supabaseInsert = async (table, row) => {
  const response = await supabaseRequest({
    path: table,
    method: 'POST',
    body: [row],
    prefer: 'return=representation',
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`insert_failed:${table}:${text || response.status}`);
  }
  try {
    const rows = await response.json();
    return Array.isArray(rows) ? rows[0] || null : null;
  } catch {
    return null;
  }
};

const fetchAuthUser = async (token) => {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey || !token) return null;
  const response = await fetch(`${url}/auth/v1/user`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      Accept: 'application/json',
    },
  });
  if (!response.ok) return null;
  try {
    const user = await response.json();
    return user?.id ? user : null;
  } catch {
    return null;
  }
};

const isAdminUser = async (user) => {
  if (!user?.id) return false;
  const appMeta = user?.app_metadata || {};
  const directRole = String(appMeta?.role || appMeta?.p3_role || '').toLowerCase();
  if (['admin', 'risk_officer', 'support'].includes(directRole)) return true;

  const { url, serviceRoleKey } = getSupabaseConfig();
  if (!url || !serviceRoleKey) return false;
  const email = trim(user?.email).toLowerCase();
  if (!email) return false;
  const rows = await supabaseSelect({
    table: 'employees',
    query: `select=id,email&email=eq.${encodeURIComponent(email)}&is_active=eq.true&role=in.(ADMIN,RISK_OFFICER,SUPPORT)&limit=1`,
  });
  return rows.length > 0;
};

export const handler = async (event) => {
  const method = (event?.httpMethod || 'GET').toUpperCase();
  if (method === 'OPTIONS') return toJsonResponse(200, { ok: true });
  if (method !== 'POST') return toJsonResponse(200, { ok: false, error: 'method_not_allowed' });

  const escrowSecret = trim(process.env.CHAT_ESCROW_SECRET);
  if (!escrowSecret) {
    return toJsonResponse(500, { ok: false, error: 'missing_chat_escrow_secret' });
  }

  let body = {};
  try {
    body = JSON.parse(event?.body || '{}');
  } catch {
    return toJsonResponse(200, { ok: false, error: 'invalid_body' });
  }

  const keyRef = trim(body?.keyRef);
  const anonSessionId = trim(body?.anonSessionId);
  if (!keyRef) return toJsonResponse(200, { ok: false, error: 'key_ref_required' });

  const token = parseBearerToken(getHeader(event, 'Authorization'));
  const authUser = await fetchAuthUser(token);
  const requesterId = trim(authUser?.id);
  const adminUser = authUser ? await isAdminUser(authUser) : false;

  if (!requesterId && !anonSessionId) {
    return toJsonResponse(401, { ok: false, error: 'auth_or_anon_session_required' });
  }

  const existing = (
    await supabaseSelect({
      table: 'chat_key_escrow',
      query: `select=*&key_ref=eq.${encodeURIComponent(keyRef)}&limit=1`,
    })
  )[0];

  if (existing) {
    const canAccess =
      (requesterId && trim(existing.owner_user_id) === requesterId) ||
      (anonSessionId && trim(existing.anon_session_id) === anonSessionId) ||
      adminUser;
    if (!canAccess) return toJsonResponse(403, { ok: false, error: 'forbidden' });
    const dek = await unwrapDekFromEscrow(
      {
        wrappedDek: existing.wrapped_dek,
        wrapIv: existing.wrap_iv,
      },
      escrowSecret
    );
    return toJsonResponse(200, {
      ok: true,
      keyRef,
      dek,
    });
  }

  const dek = generateDekB64();
  const wrapped = await wrapDekForEscrow(dek, escrowSecret);
  await supabaseInsert('chat_key_escrow', {
    key_ref: keyRef,
    owner_user_id: requesterId || null,
    anon_session_id: requesterId ? null : anonSessionId || null,
    wrapped_dek: wrapped.wrappedDek,
    wrap_iv: wrapped.wrapIv,
    wrap_alg: wrapped.wrapAlg,
  });

  return toJsonResponse(200, {
    ok: true,
    keyRef,
    dek,
  });
};

