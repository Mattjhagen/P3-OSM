const trim = (value) => String(value || '').trim();
const normalizeEmail = (value) => trim(value).toLowerCase();
const normalizeBaseUrl = (value) => trim(value).replace(/\/+$/, '');

const toJsonResponse = (statusCode, payload) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});

const parseBearerToken = (authorizationHeader) => {
  const raw = trim(authorizationHeader);
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? trim(match[1]) : '';
};

const isAllowedMethod = (method) => method === 'GET' || method === 'POST';

const parseAllowedEmails = () =>
  trim(process.env.ADMIN_ALLOWED_EMAILS)
    .split(',')
    .map((item) => normalizeEmail(item))
    .filter(Boolean);

const decodeBody = (event) => {
  if (!event?.body) return '';
  if (event.isBase64Encoded) {
    return Buffer.from(event.body, 'base64').toString('utf8');
  }
  return event.body;
};

const extractPath = (event) => {
  const path = trim(event?.queryStringParameters?.path);
  if (!path) {
    throw Object.assign(new Error("Missing required query parameter 'path'."), {
      statusCode: 400,
    });
  }
  if (path.includes('://')) {
    throw Object.assign(new Error('Invalid proxy path.'), { statusCode: 400 });
  }
  if (path.includes('?')) {
    throw Object.assign(
      new Error("Path must not contain '?' - provide query params separately."),
      { statusCode: 400 }
    );
  }
  if (!path.startsWith('/api/admin/waitlist')) {
    throw Object.assign(new Error('Not found.'), { statusCode: 404 });
  }
  return path;
};

const appendForwardQueryParams = (url, event, authenticatedEmail) => {
  const params = event?.queryStringParameters || {};
  for (const [key, value] of Object.entries(params)) {
    if (key === 'path' || key === 'adminEmail') continue;
    if (value === undefined || value === null) continue;
    url.searchParams.append(key, String(value));
  }
  url.searchParams.set('adminEmail', authenticatedEmail);
};

const buildForwardPostBody = (event, authenticatedEmail) => {
  const raw = decodeBody(event) || '{}';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw Object.assign(new Error('POST body must be valid JSON.'), { statusCode: 400 });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw Object.assign(new Error('POST body must be a JSON object.'), { statusCode: 400 });
  }
  return JSON.stringify({
    ...parsed,
    adminEmail: authenticatedEmail,
  });
};

const resolveSupabaseUser = async (accessToken) => {
  const supabaseUrl = normalizeBaseUrl(process.env.SUPABASE_URL);
  const supabaseAnonKey = trim(process.env.SUPABASE_ANON_KEY);

  if (!supabaseUrl || !supabaseAnonKey) {
    throw Object.assign(
      new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY for admin proxy auth.'),
      { statusCode: 500 }
    );
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: supabaseAnonKey,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw Object.assign(new Error('Invalid or expired admin auth token.'), {
      statusCode: 401,
    });
  }

  const data = await response.json();
  const email = normalizeEmail(data?.email);
  if (!email) {
    throw Object.assign(new Error('Authenticated admin email is missing.'), {
      statusCode: 401,
    });
  }

  return { email };
};

export const handler = async (event) => {
  const method = trim(event?.httpMethod || 'GET').toUpperCase();
  if (!isAllowedMethod(method)) {
    return toJsonResponse(405, { success: false, error: 'Method not allowed.' });
  }

  try {
    const renderBase = normalizeBaseUrl(process.env.RENDER_API_BASE);
    const internalBearer = trim(process.env.ADMIN_INTERNAL_BEARER);
    const allowedEmails = parseAllowedEmails();

    if (!renderBase || !internalBearer) {
      return toJsonResponse(500, {
        success: false,
        error: 'Missing RENDER_API_BASE or ADMIN_INTERNAL_BEARER.',
      });
    }
    if (allowedEmails.length === 0) {
      return toJsonResponse(500, {
        success: false,
        error: 'ADMIN_ALLOWED_EMAILS is not configured.',
      });
    }

    const path = extractPath(event);

    if (method === 'POST') {
      const contentType = trim(
        event?.headers?.['content-type'] || event?.headers?.['Content-Type']
      ).toLowerCase();
      if (!contentType.includes('application/json')) {
        return toJsonResponse(400, {
          success: false,
          error: 'POST requests must use application/json content type.',
        });
      }
    }

    const clientBearer = parseBearerToken(
      event?.headers?.authorization || event?.headers?.Authorization
    );
    if (!clientBearer) {
      return toJsonResponse(401, {
        success: false,
        error: 'Missing admin bearer token.',
      });
    }

    const { email: authenticatedEmail } = await resolveSupabaseUser(clientBearer);
    if (!allowedEmails.includes(authenticatedEmail)) {
      return toJsonResponse(403, {
        success: false,
        error: 'Authenticated user is not allowed to perform admin waitlist actions.',
      });
    }

    const claimedAdminEmail = normalizeEmail(
      event?.headers?.['x-admin-email'] || event?.headers?.['X-Admin-Email']
    );
    if (claimedAdminEmail && claimedAdminEmail !== authenticatedEmail) {
      return toJsonResponse(403, {
        success: false,
        error: 'Admin email header does not match authenticated token email.',
      });
    }

    const forwardUrl = new URL(`${renderBase}${path}`);
    appendForwardQueryParams(forwardUrl, event, authenticatedEmail);
    const forwardBody =
      method === 'POST' ? buildForwardPostBody(event, authenticatedEmail) : undefined;

    const response = await fetch(forwardUrl.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${internalBearer}`,
        'Content-Type': 'application/json',
        'x-admin-email': authenticatedEmail,
      },
      body: forwardBody,
    });

    const responseBody = await response.text();

    console.info(
      `[admin_waitlist_proxy] admin=${authenticatedEmail} method=${method} path=${path} status=${response.status}`
    );

    return {
      statusCode: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
      },
      body: responseBody || '',
    };
  } catch (error) {
    const statusCode = Number(error?.statusCode || 500);
    const message = error instanceof Error ? error.message : 'Unexpected admin proxy error.';
    return toJsonResponse(statusCode, {
      success: false,
      error: message,
    });
  }
};
