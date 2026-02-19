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

const timedFetch = async (url, options = {}, timeoutMs = 4500) => {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return {
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.name : 'FetchError',
    };
  } finally {
    clearTimeout(timer);
  }
};

export const handler = async (event) => {
  const method = (event?.httpMethod || 'GET').toUpperCase();
  if (method === 'OPTIONS') return toJsonResponse(200, { ok: true });
  if (method !== 'GET') return toJsonResponse(405, { ok: false, error: 'method_not_allowed' });

  const checkedAt = new Date().toISOString();
  const frontendUrl = trim(process.env.FRONTEND_STATUS_URL || process.env.URL || 'https://p3lending.space');
  const pingUrl = `${frontendUrl.replace(/\/+$/, '')}/.netlify/functions/ping`;

  const supabaseUrl = trim(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL).replace(/\/+$/, '');
  const supabaseAnonKey = trim(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY);
  const renderBackendUrl = trim(
    process.env.BACKEND_URL || process.env.VITE_BACKEND_URL || process.env.RENDER_API_BASE
  ).replace(/\/+$/, '');

  const frontend = await timedFetch(`${frontendUrl.replace(/\/+$/, '')}/`);
  const functions = await timedFetch(pingUrl);

  let supabaseRest;
  if (!supabaseUrl || !supabaseAnonKey) {
    supabaseRest = {
      ok: false,
      status: 0,
      latencyMs: 0,
      error: 'missing_env',
      url: supabaseUrl || '',
    };
  } else {
    const probe = await timedFetch(`${supabaseUrl}/rest/v1/`, {
      method: 'GET',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        Accept: 'application/json',
      },
    });
    supabaseRest = {
      ...probe,
      url: `${supabaseUrl}/rest/v1/`,
    };
  }

  let renderBackend;
  if (renderBackendUrl) {
    const probe = await timedFetch(`${renderBackendUrl}/api/health`);
    renderBackend = {
      ...probe,
      url: `${renderBackendUrl}/api/health`,
    };
  }

  const services = {
    frontend: { ...frontend, url: `${frontendUrl.replace(/\/+$/, '')}/` },
    functions: { ...functions, url: pingUrl },
    supabaseRest,
    ...(renderBackend ? { renderBackend } : {}),
  };

  const overallOk = Object.values(services).every((svc) => svc.ok);

  return toJsonResponse(200, {
    ok: overallOk,
    checkedAt,
    services,
    netlifyBadge: {
      imageUrl: 'https://api.netlify.com/api/v1/badges/ebfbace1-b5fa-40d8-baa9-f631ff3dcf89/deploy-status',
      deploysUrl: 'https://app.netlify.com/projects/p3-lending-protocol/deploys',
    },
  });
};
