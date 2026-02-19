const trim = (value) => String(value || '').trim();
const normalizeEmail = (value) => trim(value).toLowerCase();

const parseBearerToken = (authorizationHeader) => {
  const header = trim(authorizationHeader);
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? trim(match[1]) : '';
};

const getSupabaseConfig = () => {
  const url = trim(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL).replace(/\/+$/, '');
  const anonKey = trim(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY);
  const serviceRoleKey = trim(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return { url, anonKey, serviceRoleKey };
};

const getHeader = (event, name) => {
  const headers = event?.headers || {};
  return headers[name] || headers[name.toLowerCase()] || '';
};

const fetchAuthUser = async (accessToken) => {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    return { ok: false, statusCode: 500, error: 'missing_supabase_env' };
  }

  const response = await fetch(`${url}/auth/v1/user`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return { ok: false, statusCode: 401, error: 'invalid_token' };
  }

  let user = null;
  try {
    user = await response.json();
  } catch {
    user = null;
  }

  if (!user?.id) {
    return { ok: false, statusCode: 401, error: 'invalid_token' };
  }

  return { ok: true, user };
};

const isAdminClaim = (user) => {
  const appMetadata = user?.app_metadata || {};
  const directRole = String(appMetadata?.role || appMetadata?.p3_role || '').toLowerCase();
  if (['admin', 'risk_officer', 'support'].includes(directRole)) return true;

  const roles = Array.isArray(appMetadata?.p3_roles)
    ? appMetadata.p3_roles
    : Array.isArray(appMetadata?.roles)
      ? appMetadata.roles
      : [];
  return roles.some((role) =>
    ['admin', 'risk_officer', 'support'].includes(String(role).toLowerCase())
  );
};

const isAdminFromEmployeesTable = async (email) => {
  const normalizedEmail = normalizeEmail(email);
  const { url, serviceRoleKey } = getSupabaseConfig();
  if (!url || !serviceRoleKey || !normalizedEmail) return false;

  const params = new URLSearchParams({
    select: 'id,email,role,is_active',
    email: `eq.${normalizedEmail}`,
    is_active: 'eq.true',
    role: 'in.(ADMIN,RISK_OFFICER,SUPPORT)',
    limit: '1',
  });

  const response = await fetch(`${url}/rest/v1/employees?${params.toString()}`, {
    method: 'GET',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) return false;
  let rows = [];
  try {
    rows = await response.json();
  } catch {
    rows = [];
  }
  return Array.isArray(rows) && rows.length > 0;
};

export const requireAdminAuth = async (event) => {
  const token = parseBearerToken(getHeader(event, 'Authorization'));
  if (!token) return { ok: false, statusCode: 401, error: 'missing_token' };

  const auth = await fetchAuthUser(token);
  if (!auth.ok) return auth;

  const user = auth.user;
  const admin = isAdminClaim(user) || (await isAdminFromEmployeesTable(user?.email));
  if (!admin) {
    return { ok: false, statusCode: 403, error: 'admin_required' };
  }

  return {
    ok: true,
    user: {
      id: trim(user.id),
      email: normalizeEmail(user.email),
    },
  };
};

export const getSupabaseServiceConfig = getSupabaseConfig;
