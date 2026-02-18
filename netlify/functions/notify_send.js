import {
  createOutboxDbOps,
  createServiceSupabaseClient,
  createTemplateIdMap,
  isAuthorizedInternalRequest,
  processOutboxBatch,
  resolveSupabaseConfig,
  sendOutboxEmail,
  toJsonResponse,
} from './_shared/notification-core.js';

const parseLimit = (event) => {
  const queryValue = Number(event?.queryStringParameters?.limit || 25);
  if (!Number.isFinite(queryValue) || queryValue <= 0) return 25;
  return Math.min(50, Math.floor(queryValue));
};

export const config = {
  schedule: '*/15 * * * *',
};

export const handler = async (event) => {
  if (!isAuthorizedInternalRequest(event)) {
    return toJsonResponse(401, {
      success: false,
      error: 'Unauthorized. Use internal bearer auth or Netlify schedule invocation.',
    });
  }

  const { url, serviceRoleKey } = resolveSupabaseConfig();
  if (!url || !serviceRoleKey) {
    return toJsonResponse(500, {
      success: false,
      error:
        'Missing Supabase configuration. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    });
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return toJsonResponse(500, {
      success: false,
      error: 'Unable to initialize Supabase service client.',
    });
  }

  const templateMap = createTemplateIdMap();
  const dbOps = createOutboxDbOps(supabase);
  const limit = parseLimit(event);

  try {
    const summary = await processOutboxBatch({
      dbOps,
      limit,
      sendEmail: (row) => sendOutboxEmail(row, { templateMap }),
    });

    return toJsonResponse(200, {
      success: true,
      data: {
        ...summary,
        limit,
        processedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown outbox processing error';
    return toJsonResponse(500, {
      success: false,
      error: message,
    });
  }
};
