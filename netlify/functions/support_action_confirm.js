const trim = (value) => String(value || '').trim();
const nowIso = () => new Date().toISOString();
const newUuid = () => globalThis.crypto?.randomUUID?.() || '00000000-0000-4000-8000-000000000000';

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

const getHeader = (event, name) => {
  const headers = event?.headers || {};
  return headers[name] || headers[name.toLowerCase()] || '';
};

const parseBearerToken = (authorizationHeader) => {
  const header = trim(authorizationHeader);
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? trim(match[1]) : '';
};

const getSupabaseConfig = () => ({
  url: trim(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL).replace(/\/+$/, ''),
  anonKey: trim(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY),
  serviceRoleKey: trim(process.env.SUPABASE_SERVICE_ROLE_KEY),
});

const supabaseRequest = async ({ path, method = 'GET', body = null, query = '', prefer = '' }) => {
  const { url, serviceRoleKey } = getSupabaseConfig();
  if (!url || !serviceRoleKey) throw new Error('missing_supabase_env');
  const response = await fetch(`${url}/rest/v1/${path}${query ? `?${query}` : ''}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return response;
};

const fetchAuthUser = async (accessToken) => {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey || !accessToken) return null;
  const response = await fetch(`${url}/auth/v1/user`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
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

const selectOne = async ({ table, query }) => {
  const response = await supabaseRequest({ path: table, method: 'GET', query });
  if (!response.ok) return null;
  try {
    const rows = await response.json();
    return Array.isArray(rows) ? rows[0] || null : null;
  } catch {
    return null;
  }
};

const updateRows = async ({ table, query, patch }) => {
  const response = await supabaseRequest({
    path: table,
    method: 'PATCH',
    query,
    body: patch,
    prefer: 'return=representation',
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`update_failed:${text || response.status}`);
  }
  try {
    const rows = await response.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
};

const insertRow = async (table, row) => {
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

const buildSystemMessage = ({ threadId, text }) => ({
  id: `msg_${Date.now()}_system`,
  senderId: 'system',
  senderName: 'P3 Support',
  role: 'SUPPORT',
  message: text,
  timestamp: Date.now(),
  type: 'CUSTOMER_SUPPORT',
  threadId,
});

const buildChatRow = (payload) => ({
  id: payload.id,
  thread_id: payload.threadId,
  sender_id: payload.senderId,
  sender_name: payload.senderName,
  role: payload.role,
  message: payload.message,
  type: 'CUSTOMER_SUPPORT',
  data: payload,
});

const updateUserData = async ({ userId, actionType, fields }) => {
  const userRow = await selectOne({
    table: 'users',
    query: `select=id,data&id=eq.${encodeURIComponent(userId)}&limit=1`,
  });
  if (!userRow) throw new Error('user_not_found');
  const currentData = userRow.data && typeof userRow.data === 'object' ? { ...userRow.data } : {};
  const notificationPrefs =
    currentData.notification_preferences && typeof currentData.notification_preferences === 'object'
      ? { ...currentData.notification_preferences }
      : {};

  if (actionType === 'propose_update_profile') {
    if (typeof fields.display_name === 'string' && trim(fields.display_name)) {
      currentData.name = trim(fields.display_name);
    }
    if (typeof fields.phone === 'string' && trim(fields.phone)) {
      currentData.phone = trim(fields.phone);
    }
  }

  if (actionType === 'propose_set_notifications') {
    if (typeof fields.email_opt_in === 'boolean') notificationPrefs.email_opt_in = fields.email_opt_in;
    if (typeof fields.sms_opt_in === 'boolean') notificationPrefs.sms_opt_in = fields.sms_opt_in;
    currentData.notification_preferences = notificationPrefs;
  }

  await updateRows({
    table: 'users',
    query: `id=eq.${encodeURIComponent(userId)}`,
    patch: { data: currentData },
  });
  return {
    updated: true,
    updated_fields: fields,
  };
};

export const handler = async (event) => {
  const method = (event?.httpMethod || 'GET').toUpperCase();
  if (method === 'OPTIONS') return toJsonResponse(200, { ok: true });
  if (method !== 'POST') return toJsonResponse(200, { ok: false, error: 'method_not_allowed' });

  let body = {};
  try {
    body = JSON.parse(event?.body || '{}');
  } catch {
    return toJsonResponse(200, { ok: false, error: 'invalid_body' });
  }

  const actionId = trim(body?.actionId);
  const confirm = Boolean(body?.confirm);
  if (!actionId) return toJsonResponse(200, { ok: false, error: 'action_id_required' });

  const token = parseBearerToken(getHeader(event, 'Authorization'));
  const authUser = await fetchAuthUser(token);
  if (!authUser?.id) {
    return toJsonResponse(401, { ok: false, error: 'auth_required', messages: [] });
  }

  const action = await selectOne({
    table: 'support_actions',
    query: `select=*&id=eq.${encodeURIComponent(actionId)}&limit=1`,
  });
  if (!action) return toJsonResponse(404, { ok: false, error: 'action_not_found', messages: [] });
  if (trim(action.user_id) !== trim(authUser.id)) {
    return toJsonResponse(403, { ok: false, error: 'forbidden', messages: [] });
  }
  if (trim(action.status) !== 'proposed') {
    return toJsonResponse(409, { ok: false, error: 'action_not_proposed', messages: [] });
  }

  const request = action.request && typeof action.request === 'object' ? action.request : {};
  const fields = request.fields && typeof request.fields === 'object' ? request.fields : {};
  const threadId = trim(request.threadId || authUser.id || 'support');
  const conversationId = trim(action.conversation_id);

  if (!confirm) {
    await updateRows({
      table: 'support_actions',
      query: `id=eq.${encodeURIComponent(actionId)}`,
      patch: { status: 'cancelled', result: { cancelled_at: nowIso() } },
    });
    const cancelledMsg = buildSystemMessage({ threadId, text: 'Cancelled. No account changes were made.' });
    await insertRow('support_messages', {
      id: newUuid(),
      conversation_id: conversationId,
      sender_type: 'system',
      content: cancelledMsg.message,
      metadata: { actionId, status: 'cancelled' },
    });
    await insertRow('chats', buildChatRow(cancelledMsg));
    return toJsonResponse(200, {
      ok: true,
      messages: [cancelledMsg],
      action: { id: actionId, status: 'cancelled', result: { cancelled: true } },
    });
  }

  try {
    await updateRows({
      table: 'support_actions',
      query: `id=eq.${encodeURIComponent(actionId)}`,
      patch: { status: 'confirmed', updated_at: nowIso() },
    });

    const executionResult = await updateUserData({
      userId: authUser.id,
      actionType: trim(action.action_type),
      fields,
    });

    await updateRows({
      table: 'support_actions',
      query: `id=eq.${encodeURIComponent(actionId)}`,
      patch: { status: 'executed', result: executionResult, updated_at: nowIso() },
    });

    const doneMsg = buildSystemMessage({
      threadId,
      text: 'Done. Your requested account change has been applied.',
    });
    await insertRow('support_messages', {
      id: newUuid(),
      conversation_id: conversationId,
      sender_type: 'system',
      content: doneMsg.message,
      metadata: { actionId, status: 'executed', result: executionResult },
    });
    await insertRow('chats', buildChatRow(doneMsg));

    return toJsonResponse(200, {
      ok: true,
      messages: [doneMsg],
      action: { id: actionId, status: 'executed', result: executionResult },
    });
  } catch (error) {
    await updateRows({
      table: 'support_actions',
      query: `id=eq.${encodeURIComponent(actionId)}`,
      patch: {
        status: 'failed',
        result: { error: error instanceof Error ? error.message : 'execution_failed' },
        updated_at: nowIso(),
      },
    });
    const failMsg = buildSystemMessage({
      threadId,
      text: 'We could not apply that change. A support ticket has been created for follow-up.',
    });
    await insertRow('support_messages', {
      id: newUuid(),
      conversation_id: conversationId,
      sender_type: 'system',
      content: failMsg.message,
      metadata: { actionId, status: 'failed' },
    });
    await insertRow('chats', buildChatRow(failMsg));
    return toJsonResponse(200, {
      ok: false,
      messages: [failMsg],
      action: { id: actionId, status: 'failed', result: { error: 'execution_failed' } },
    });
  }
};
