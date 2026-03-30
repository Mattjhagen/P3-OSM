const trim = (value) => String(value || '').trim();
const normalizeEmail = (value) => trim(value).toLowerCase();
const toJsonResponse = (statusCode, payload) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});

const resolveSupabaseConfig = () => {
  const url = trim(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const key = trim(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY
  );

  return { url, key };
};

const parseEventBody = (event) => {
  try {
    return JSON.parse(event?.body || '{}');
  } catch {
    return {};
  }
};

const resolveName = (user, email) => {
  const metadata = user?.user_metadata && typeof user.user_metadata === 'object'
    ? user.user_metadata
    : {};

  const fullName = trim(metadata.full_name || metadata.name || metadata.fullName);
  if (fullName) return fullName.slice(0, 150);

  const localPart = trim(email).split('@')[0] || 'Netlify User';
  return localPart.slice(0, 150);
};

const insertWaitlistRow = async ({ url, key, row }) => {
  const endpoint = `${url.replace(/\/+$/, '')}/rest/v1/waitlist?on_conflict=email`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=representation',
    },
    body: JSON.stringify([row]),
  });

  const text = await response.text();
  let parsed = null;

  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    const detail =
      trim(parsed?.message) ||
      trim(parsed?.error) ||
      trim(text) ||
      `Supabase waitlist insert failed (${response.status}).`;
    throw new Error(detail);
  }

  return Array.isArray(parsed) ? parsed : [];
};

export const handler = async (event) => {
  const { url, key } = resolveSupabaseConfig();

  if (!url || !key) {
    return toJsonResponse(500, {
      success: false,
      error:
        'Missing Supabase env vars for identity-signup. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY).',
    });
  }

  const payload = parseEventBody(event);
  const user = payload?.user && typeof payload.user === 'object' ? payload.user : payload;

  const email = normalizeEmail(user?.email);
  if (!email || !email.includes('@')) {
    return toJsonResponse(200, {
      success: true,
      skipped: true,
      reason: 'No valid email found in identity-signup payload.',
    });
  }

  const row = {
    name: resolveName(user, email),
    email,
    status: 'PENDING',
    created_at: trim(user?.confirmed_at) || new Date().toISOString(),
  };

  try {
    const insertedRows = await insertWaitlistRow({ url, key, row });
    console.info(`[identity-signup] Successfully added ${email} to waitlist.`, { inserted: insertedRows.length });
    return toJsonResponse(200, {
      success: true,
      email,
      inserted: insertedRows.length,
      source: 'netlify_identity_signup',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown identity-signup error';
    console.error(`[identity-signup] Error for ${email}:`, message);
    
    // We return 200 even on error to avoid blocking the Netlify Identity signup/invite flow
    // The user will still be created in Netlify, even if the waitlist sync fails.
    return toJsonResponse(200, {
      success: false,
      error: message,
      skipped: true,
      reason: 'Supabase waitlist sync failed, but allowing signup to proceed.',
    });
  }
};
