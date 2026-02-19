/**
 * Admin waitlist proxy: validates client Supabase session, then forwards
 * to Render backend with internal bearer. Browser must not call Render admin
 * endpoints directly when ADMIN_INTERNAL_BEARER is used.
 */

const trim = (value) => String(value || '').trim();
const normalizeEmail = (value) => trim(value).toLowerCase();
const PROXY_HEADER_NAME = 'X-P3-Proxy';
const PROXY_HEADER_VALUE = 'admin_waitlist_proxy';

const toJsonResponse = (statusCode, payload) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    [PROXY_HEADER_NAME]: PROXY_HEADER_VALUE,
  },
  body: JSON.stringify(payload),
});

const getHeader = (event, name) => {
  const h = event.headers || {};
  const lower = name.toLowerCase();
  return h[lower] || h[name] || '';
};

const getReqId = (event) =>
  trim(getHeader(event, 'x-nf-request-id') || getHeader(event, 'x-nf-request-id'));

const parseCookies = (cookieHeader) => {
  const raw = trim(cookieHeader);
  if (!raw) return {};
  return raw.split(';').reduce((acc, pair) => {
    const [key, ...valueParts] = pair.split('=');
    const name = trim(key);
    if (!name) return acc;
    acc[name] = decodeURIComponent(trim(valueParts.join('=')));
    return acc;
  }, {});
};

const parseBearerToken = (authorizationHeader) => {
  const header = trim(authorizationHeader);
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? trim(match[1]) : '';
};

const parseTokenFromRequest = (event) => {
  const authHeader = getHeader(event, 'Authorization');
  const bearer = parseBearerToken(authHeader);
  if (bearer) return bearer;
  const cookies = parseCookies(getHeader(event, 'cookie'));
  return trim(cookies.nf_jwt || '');
};


const looksLikeJwt = (token) => /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(token);

const decodeJwtPayload = (token) => {
  try {
    const [, payload] = String(token || '').split('.');
    if (!payload) return null;
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
};

const getJwtIssuer = (token) => {
  const payload = decodeJwtPayload(token);
  return trim(payload?.iss || '');
};

const looksLikeSupabaseIssuer = (issuer) => {
  const { url } = getSupabaseConfig();
  if (!issuer || !url) return false;
  const base = url.replace(/\/+$/, '');
  // Supabase issuer is typically the auth base URL.
  return issuer.startsWith(base);
};

const getNetlifyIdentityUser = async (accessToken) => {
  const siteUrl = trim(process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL || '');
  if (!siteUrl) return { ok: false, error: 'Proxy misconfiguration: missing site URL.' };

  const base = siteUrl.replace(/\/+$/, '');
  const res = await fetch(`${base}/.netlify/identity/user`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    return { ok: false, error: 'Invalid/expired Netlify Identity session token.' };
  }

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!payload?.id && !payload?.sub) {
    return { ok: false, error: 'Invalid/expired Netlify Identity session token.' };
  }

  // Normalize to the same shape we expect elsewhere
  return {
    ok: true,
    user: {
      id: trim(payload.sub || payload.id),
      email: normalizeEmail(payload.email),
      app_metadata: payload.app_metadata || {},
    },
  };
};

const getSupabaseConfig = () => {
  const url = trim(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const anonKey = trim(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY);
  const serviceRoleKey = trim(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return { url, anonKey, serviceRoleKey };
};

const getSupabaseUser = async (accessToken) => {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    return { ok: false, error: 'Proxy misconfiguration: missing Supabase env.' };
  }
  const base = url.replace(/\/+$/, '');
  const res = await fetch(`${base}/auth/v1/user`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    return { ok: false, error: 'Invalid/expired Supabase session token.' };
  }
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!payload?.id) {
    return { ok: false, error: 'Invalid/expired Supabase session token.' };
  }
  return { ok: true, user: payload };
};

const hasAdminClaim = (user) => {
  const appMetadata = user?.app_metadata || {};
  const directRole = String(appMetadata?.role || appMetadata?.p3_role || '').toLowerCase();
  if (['admin', 'risk_officer', 'support'].includes(directRole)) return true;

  const p3Roles = Array.isArray(appMetadata?.p3_roles)
    ? appMetadata.p3_roles
    : Array.isArray(appMetadata?.roles)
      ? appMetadata.roles
      : [];
  return p3Roles.some((role) =>
    ['admin', 'risk_officer', 'support'].includes(String(role).toLowerCase())
  );
};

const isAdminFromEmployeesTable = async (userEmail) => {
  const email = normalizeEmail(userEmail);
  const { url, serviceRoleKey } = getSupabaseConfig();
  if (!url || !serviceRoleKey || !email) return false;

  const base = url.replace(/\/+$/, '');
  const params = new URLSearchParams({
    select: 'id,email,role,is_active',
    email: `eq.${email}`,
    is_active: 'eq.true',
    role: 'in.(ADMIN,RISK_OFFICER,SUPPORT)',
    limit: '1',
  });

  const res = await fetch(`${base}/rest/v1/employees?${params.toString()}`, {
    method: 'GET',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) return false;
  let rows = [];
  try {
    rows = await res.json();
  } catch {
    rows = [];
  }
  return Array.isArray(rows) && rows.length > 0;
};

export const handler = async (event, context) => {
  const reqId = getReqId(event) || 'no-reqid';
  if ((event?.httpMethod || 'GET').toUpperCase() === 'GET') {
    return toJsonResponse(200, {
      ok: true,
      name: PROXY_HEADER_VALUE,
    });
  }

  const path = trim(event?.queryStringParameters?.path || '');
  if (!path || !path.startsWith('/')) {
    return toJsonResponse(400, {
      success: false,
      error: 'Query parameter path is required and must start with /.',
    });
  }

  const hasCookie = Boolean(trim(getHeader(event, 'cookie')));
  const contextUser = context?.clientContext?.user || null;
  const contextUserPresent = Boolean(contextUser?.sub || contextUser?.id || contextUser?.email);
  const accessToken = parseTokenFromRequest(event);
  const hasAuthHeader = Boolean(parseBearerToken(getHeader(event, 'Authorization')));
  const tokenLength = accessToken.length;
  console.info('[admin_waitlist_proxy] auth_probe', {
    reqId,
    hasAuthHeader,
    hasCookie,
    contextUserPresent,
    path,
  });

  let authProvider = 'netlify_context';
  let user = null;

  if (contextUserPresent) {
    user = {
      id: trim(contextUser?.sub || contextUser?.id),
      email: normalizeEmail(contextUser?.email),
      app_metadata: contextUser?.app_metadata || {},
    };
  } else if (!accessToken) {
    console.warn('[admin_waitlist_proxy] unauthorized', {
      reqId,
      reason: 'missing_token',
      hasAuthHeader,
      hasCookie,
      contextUserPresent,
      tokenLength,
      path,
    });
    return toJsonResponse(401, {
      success: false,
      error: 'Missing session token.',
    });
  } else {
    if (!looksLikeJwt(accessToken)) {
      console.warn('[admin_waitlist_proxy] unauthorized', {
        reqId,
        reason: 'invalid_token_format',
        hasAuthHeader,
        hasCookie,
        tokenLength,
        path,
      });
      return toJsonResponse(401, {
        success: false,
        error: 'Invalid session token.',
      });
    }

    const issuer = getJwtIssuer(accessToken);
    const treatAsSupabase = looksLikeSupabaseIssuer(issuer);

    authProvider = treatAsSupabase ? 'supabase' : 'netlify_identity';

    const authResult = treatAsSupabase
      ? await getSupabaseUser(accessToken)
      : await getNetlifyIdentityUser(accessToken);

    console.info('[admin_waitlist_proxy] token_auth_result', {
      reqId,
      ok: authResult.ok,
      authProvider,
      hasIssuer: Boolean(issuer),
      path,
    });

    if (!authResult.ok) {
      console.warn('[admin_waitlist_proxy] unauthorized', {
        reqId,
        reason: 'invalid_token',
        hasAuthHeader,
        hasCookie,
        contextUserPresent,
        tokenLength,
        authProvider,
        path,
      });
      return toJsonResponse(401, {
        success: false,
        error: 'Invalid/expired admin session token.',
      });
    }

    user = treatAsSupabase ? authResult.user : authResult.user;
  }

  if (!user) {
    console.warn('[admin_waitlist_proxy] unauthorized', {
      reqId,
      reason: 'invalid_token',
      hasAuthHeader,
      hasCookie,
      contextUserPresent,
      tokenLength,
      authProvider,
      path,
    });
    return toJsonResponse(401, {
      success: false,
      error: 'Invalid/expired admin session token.',
    });
  }

  const userId = trim(user?.id);
  const userEmail = normalizeEmail(user?.email);
  const isAdmin = hasAdminClaim(user) || (await isAdminFromEmployeesTable(userEmail));
  if (!isAdmin) {
    console.warn('[admin_waitlist_proxy] forbidden', {
      reqId,
      reason: 'not_admin',
      hasAuthHeader,
      hasCookie,
      contextUserPresent,
      tokenLength,
      authProvider,
      userId,
      userEmail,
      isAdmin,
      path,
    });
    return toJsonResponse(403, {
      success: false,
      error: 'Not authorized.',
    });
  }

  const backendBase = trim(
    process.env.VITE_BACKEND_URL || process.env.BACKEND_URL || ''
  ).replace(/\/api\/?$/i, '');
  const internalBearer = trim(process.env.ADMIN_INTERNAL_BEARER || '');

  if (!backendBase) {
    return toJsonResponse(500, {
      success: false,
      error: 'Proxy misconfiguration: missing backend URL.',
    });
  }
  if (!internalBearer) {
    console.error('[admin_waitlist_proxy] misconfigured', {
      reqId,
      reason: 'missing_internal_bearer',
      userId,
      isAdmin,
      path,
    });
    return toJsonResponse(500, {
      success: false,
      error: 'Proxy misconfiguration: missing internal admin bearer.',
    });
  }

  const url = `${backendBase}${path}`;
  const method = (event.httpMethod || 'GET').toUpperCase();
  const body = event.body || undefined;
  const headers = {
    'Content-Type': getHeader(event, 'Content-Type') || 'application/json',
    Authorization: `Bearer ${internalBearer}`,
  };
  const xAdminEmail = getHeader(event, 'x-admin-email');
  if (xAdminEmail) headers['x-admin-email'] = xAdminEmail;

  try {
    const res = await fetch(url, {
      method,
      headers,
      ...(body && method !== 'GET' ? { body } : {}),
    });
    console.info('[admin_waitlist_proxy] upstream_response', {
      reqId,
      userId,
      isAdmin,
      authProvider,
      path,
      upstreamStatus: res.status,
    });
    const text = await res.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    return {
      statusCode: res.status,
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'application/json',
        [PROXY_HEADER_NAME]: PROXY_HEADER_VALUE,
      },
      body: parsed ? JSON.stringify(parsed) : text || '{}',
    };
  } catch (err) {
    console.error('[admin_waitlist_proxy] upstream_error', {
      reqId,
      userId,
      isAdmin,
      path,
      upstreamStatus: 502,
    });
    const message = err instanceof Error ? err.message : 'Backend request failed.';
    return toJsonResponse(502, {
      success: false,
      error: `Unable to reach backend: ${message}`,
    });
  }
};
