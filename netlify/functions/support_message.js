import {
  decryptEnvelopeWithDek,
  encryptPlaintextWithDek,
  generateDekB64,
  unwrapDekFromEscrow,
  wrapDekForEscrow,
} from './_shared/chat-crypto.js';

const trim = (value) => String(value || '').trim();
const asNowIso = () => new Date().toISOString();
const newId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `00000000-0000-4000-8000-${String(Date.now()).padStart(12, '0').slice(-12)}`;
const isUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trim(value));

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

const parseBearerToken = (authorizationHeader) => {
  const header = trim(authorizationHeader);
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? trim(match[1]) : '';
};

const getHeader = (event, name) => {
  const headers = event?.headers || {};
  return headers[name] || headers[name.toLowerCase()] || '';
};

const buildChatMessageRow = (payload) => ({
  id: payload.id,
  thread_id: payload.threadId,
  sender_id: payload.senderId,
  sender_name: payload.senderName,
  role: payload.role,
  message: payload.message,
  type: 'CUSTOMER_SUPPORT',
  data: payload,
});

const supabaseRequest = async ({ path, method = 'GET', body = null, query = '', prefer = '' }) => {
  const { url, serviceRoleKey } = getSupabaseConfig();
  if (!url || !serviceRoleKey) throw new Error('missing_supabase_env');
  const requestUrl = `${url}/rest/v1/${path}${query ? `?${query}` : ''}`;
  const response = await fetch(requestUrl, {
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

const supabaseInsert = async (table, row) => {
  const response = await supabaseRequest({
    path: table,
    method: 'POST',
    body: [row],
    prefer: 'return=representation',
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase insert failed (${table}): ${text || response.status}`);
  }
  let payload = [];
  try {
    payload = await response.json();
  } catch {
    payload = [];
  }
  return Array.isArray(payload) ? payload[0] || null : null;
};

const supabaseUpdate = async ({ table, query, patch }) => {
  const response = await supabaseRequest({
    path: table,
    method: 'PATCH',
    query,
    body: patch,
    prefer: 'return=representation',
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase update failed (${table}): ${text || response.status}`);
  }
  let payload = [];
  try {
    payload = await response.json();
  } catch {
    payload = [];
  }
  return Array.isArray(payload) ? payload : [];
};

const supabaseSelect = async ({ table, query }) => {
  const response = await supabaseRequest({ path: table, method: 'GET', query });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase select failed (${table}): ${text || response.status}`);
  }
  let payload = [];
  try {
    payload = await response.json();
  } catch {
    payload = [];
  }
  return Array.isArray(payload) ? payload : [];
};

const isEncryptedEnvelope = (value) =>
  value &&
  typeof value === 'object' &&
  value.enc_v === 1 &&
  String(value.alg || '').toUpperCase() === 'AES-GCM' &&
  typeof value.iv === 'string' &&
  typeof value.ciphertext === 'string';

const getEscrowSecret = () => trim(process.env.CHAT_ESCROW_SECRET);

const getOrCreateConversationDek = async ({ keyRef, userId = '', anonSessionId = '' }) => {
  const normalizedKeyRef = trim(keyRef);
  if (!normalizedKeyRef) throw new Error('key_ref_required');
  const escrowSecret = getEscrowSecret();
  if (!escrowSecret) throw new Error('missing_chat_escrow_secret');

  const rows = await supabaseSelect({
    table: 'chat_key_escrow',
    query: `select=*&key_ref=eq.${encodeURIComponent(normalizedKeyRef)}&limit=1`,
  });
  const row = rows[0];
  if (row?.wrapped_dek && row?.wrap_iv) {
    return unwrapDekFromEscrow({ wrappedDek: row.wrapped_dek, wrapIv: row.wrap_iv }, escrowSecret);
  }

  const dek = generateDekB64();
  const wrapped = await wrapDekForEscrow(dek, escrowSecret);
  await supabaseInsert('chat_key_escrow', {
    key_ref: normalizedKeyRef,
    owner_user_id: trim(userId) || null,
    anon_session_id: trim(userId) ? null : trim(anonSessionId) || null,
    wrapped_dek: wrapped.wrappedDek,
    wrap_iv: wrapped.wrapIv,
    wrap_alg: wrapped.wrapAlg,
  });
  return dek;
};

const buildEncryptedChatPayload = async ({ msg, keyRef, dek }) => {
  const envelope = await encryptPlaintextWithDek(msg.message, dek, JSON.stringify({ keyRef, msgId: msg.id }));
  return {
    ...msg,
    message: '[encrypted]',
    keyRef,
    encryptedEnvelope: envelope,
    enc_v: 1,
  };
};

const notifyAdminsForSupportMessage = async ({ threadId, messageId, senderName, message }) => {
  const notifySecret = trim(process.env.PUSH_NOTIFY_SECRET);
  const siteBaseUrl = trim(process.env.URL || process.env.DEPLOY_PRIME_URL);
  if (!notifySecret || !siteBaseUrl) return;

  const notifyUrl = `${siteBaseUrl.replace(/\/+$/, '')}/.netlify/functions/push_notify_admins`;
  const shortMessage = trim(message).slice(0, 140);
  try {
    await fetch(notifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-push-secret': notifySecret,
      },
      body: JSON.stringify({
        title: 'New P3 support message',
        body: `${senderName || 'Customer'}: ${shortMessage || 'New customer message'}`,
        url: `/?tab=OPERATIONS&thread=${encodeURIComponent(threadId)}`,
        threadId,
        messageId,
      }),
    });
  } catch {
    // Best effort only; chat flow must continue.
  }
};

const buildSystemMessage = ({ threadId, ticketId, text }) => ({
  id: `msg_${Date.now()}_system`,
  senderId: 'system',
  senderName: 'P3 Support',
  role: 'SUPPORT',
  message:
    text ||
    (ticketId
      ? `We're creating a support ticket for you. Ticket ID: ${ticketId}. A human will reply shortly.`
      : "We're creating a support ticket for you. A human will reply shortly."),
  timestamp: Date.now(),
  type: 'CUSTOMER_SUPPORT',
  threadId,
});

const P3_FAQ_CONTEXT = `
P3 Lending Protocol quick FAQ:
- P3 helps users access borrowing and investing flows with transparent status tracking.
- Borrowing flow: join waitlist, complete onboarding/KYC checks, submit request, receive matching and repayment terms.
- Investing flow: browse opportunities, review risk and terms, and monitor repayments from active positions.
- Fees: shown before confirmation and vary by product/workflow; users should check current in-app disclosures.
- Waitlist: users can join and move through pending/invited/onboarded states.
- Security: account access and sensitive actions require authenticated sessions and server-side validation.
`;

const SUPPORT_SYSTEM_PROMPT = `
You are P3 Support. Keep answers short, factual, and non-speculative.
Rules:
1) Use only provided P3 context and user message.
2) Never claim account changes are completed unless confirmed by server execution.
3) If request asks for prohibited operations (money movement, loan approvals, credit-limit/trust-score overrides, payout address changes, KYC decisions), refuse and suggest ticket handoff.
4) If asked to change profile name, phone, or notification preferences, return concise guidance and tell the user to confirm when prompted.
5) If unsure, say you will create a support ticket.
`;

const FORBIDDEN_KEYWORDS = [
  'move money',
  'transfer',
  'approve loan',
  'credit limit',
  'trust score',
  'payout address',
  'kyc decision',
  'wallet address',
];

const shouldForceHandoff = (text) => {
  const q = trim(text).toLowerCase();
  if (!q) return true;
  const humanKeywords = [
    'human',
    'agent',
    'admin',
    'representative',
    'account locked',
    'chargeback',
    'legal',
    'compliance',
    'escalate',
  ];
  return humanKeywords.some((keyword) => q.includes(keyword));
};

const containsForbiddenRequest = (text) => {
  const normalized = trim(text).toLowerCase();
  return FORBIDDEN_KEYWORDS.some((keyword) => normalized.includes(keyword));
};

const detectToolIntent = (text) => {
  const normalized = trim(text).toLowerCase();
  if (!normalized) return { tool: 'answer_only' };

  const asksNameUpdate =
    (normalized.includes('display name') || normalized.includes('name')) &&
    /(change|update|set)/.test(normalized);
  const asksPhoneUpdate = normalized.includes('phone') && /(change|update|set)/.test(normalized);
  const asksNotificationUpdate =
    /(notification|notifications|email alerts|sms alerts|text alerts)/.test(normalized) &&
    /(change|update|set|turn on|turn off|enable|disable)/.test(normalized);

  if (asksNameUpdate || asksPhoneUpdate) {
    const quotedName = text.match(/name\s+(?:to|as)\s+["']?([a-zA-Z0-9 .,'-]{2,80})["']?/i);
    const phoneMatch = text.match(/(\+?[0-9][0-9()\-\s]{7,20}[0-9])/);
    const displayName = trim(quotedName?.[1] || '');
    const phone = trim(phoneMatch?.[1] || '');
    const fields = {};
    if (displayName) fields.display_name = displayName;
    if (phone) fields.phone = phone;
    if (!Object.keys(fields).length) return { tool: 'answer_only' };
    return {
      tool: 'propose_update_profile',
      fields,
      summary: 'Update your profile details',
    };
  }

  if (asksNotificationUpdate) {
    const wantsEmailOn = /(email).*(enable|turn on|opt in)/.test(normalized);
    const wantsEmailOff = /(email).*(disable|turn off|opt out)/.test(normalized);
    const wantsSmsOn = /(sms|text).*(enable|turn on|opt in)/.test(normalized);
    const wantsSmsOff = /(sms|text).*(disable|turn off|opt out)/.test(normalized);
    const fields = {};
    if (wantsEmailOn) fields.email_opt_in = true;
    if (wantsEmailOff) fields.email_opt_in = false;
    if (wantsSmsOn) fields.sms_opt_in = true;
    if (wantsSmsOff) fields.sms_opt_in = false;
    if (!Object.keys(fields).length) return { tool: 'answer_only' };
    return {
      tool: 'propose_set_notifications',
      fields,
      summary: 'Update your notification preferences',
    };
  }

  return { tool: 'answer_only' };
};

const resolveAiProvider = () => {
  const openaiKey = trim(process.env.OPENAI_API_KEY);
  if (openaiKey) {
    return {
      provider: 'openai',
      key: openaiKey,
      model: trim(process.env.OPENAI_MODEL || 'gpt-4o-mini'),
    };
  }

  const geminiKey = trim(
    process.env.RAW_GEMINI_KEY || process.env.API_KEY || process.env.GEMINI_API_KEY
  );
  if (geminiKey) {
    return {
      provider: 'gemini',
      key: geminiKey,
      model: trim(process.env.GEMINI_MODEL || 'gemini-1.5-flash'),
    };
  }

  return null;
};

const fetchAuthUserFromToken = async (token) => {
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
    if (!user?.id) return null;
    return user;
  } catch {
    return null;
  }
};

const getMinimalAccountContext = async (userId) => {
  if (!trim(userId)) return null;
  try {
    const rows = await supabaseSelect({
      table: 'users',
      query: `select=id,email,data&id=eq.${encodeURIComponent(userId)}&limit=1`,
    });
    const row = rows[0];
    if (!row) return null;
    const data = row.data && typeof row.data === 'object' ? row.data : {};
    const notificationPrefs =
      data.notification_preferences && typeof data.notification_preferences === 'object'
        ? data.notification_preferences
        : {};
    return {
      userId: row.id,
      displayName: trim(data.name || ''),
      hasPhone: Boolean(trim(data.phone || '')),
      emailOptIn: typeof notificationPrefs.email_opt_in === 'boolean' ? notificationPrefs.email_opt_in : null,
      smsOptIn: typeof notificationPrefs.sms_opt_in === 'boolean' ? notificationPrefs.sms_opt_in : null,
      onboardingState: trim(data.kycStatus || ''),
    };
  } catch {
    return null;
  }
};

const generateAiReply = async ({ userMessage, accountContext }) => {
  const providerConfig = resolveAiProvider();
  if (!providerConfig) {
    throw new Error('AI provider unavailable.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2200);

  try {
    if (providerConfig.provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${providerConfig.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: providerConfig.model,
          temperature: 0.2,
          max_tokens: 180,
          messages: [
            {
              role: 'system',
              content: `${SUPPORT_SYSTEM_PROMPT}\n\nKnowledge base:\n${P3_FAQ_CONTEXT}`,
            },
            {
              role: 'user',
              content: `User message: ${userMessage}\n\nAccount context: ${JSON.stringify(accountContext || {})}`,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`AI upstream returned ${response.status}`);
      }

      const payload = await response.json();
      const content = trim(payload?.choices?.[0]?.message?.content || '');
      if (!content) {
        throw new Error('AI returned empty content.');
      }
      return content;
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        providerConfig.model
      )}:generateContent?key=${encodeURIComponent(providerConfig.key)}`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `${SUPPORT_SYSTEM_PROMPT}\n\n${P3_FAQ_CONTEXT}\n\nUser question: ${userMessage}\nAccount context: ${JSON.stringify(
                    accountContext || {}
                  )}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 180,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`AI upstream returned ${response.status}`);
    }

    const payload = await response.json();
    const content = trim(payload?.candidates?.[0]?.content?.parts?.[0]?.text || '');
    if (!content) {
      throw new Error('AI returned empty content.');
    }
    return content;
  } finally {
    clearTimeout(timeout);
  }
};

const createSupportTicket = async ({ threadId, userId, userName, message }) => {
  const ticketId = newId();
  const ticketData = {
    id: ticketId,
    authorId: userId,
    authorName: userName || 'Customer',
    subject: `[SUPPORT] Human handoff required (${threadId})`,
    description: trim(message).slice(0, 1000),
    priority: 'MEDIUM',
    status: 'OPEN',
    createdAt: Date.now(),
  };

  await supabaseInsert('tickets', {
    id: ticketData.id,
    status: ticketData.status,
    type: 'support',
    source: 'support_message',
    created_by: isUuid(userId) ? userId : null,
    data: ticketData,
  });

  return ticketId;
};

const logSupportError = (reqId, code, error) => {
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  console.error(`[support_message] reqId=${reqId || ''} code=${code} error=${errorName}`);
};

const upsertConversation = async ({ conversationId, userId, anonSessionId }) => {
  const id = isUuid(conversationId) ? conversationId : newId();
  const row = {
    id,
    user_id: trim(userId) || null,
    anon_session_id: trim(userId) ? null : trim(anonSessionId || '') || `anon_${Date.now()}`,
    status: 'open',
    updated_at: asNowIso(),
  };
  const response = await supabaseRequest({
    path: `support_conversations?on_conflict=id`,
    method: 'POST',
    body: [row],
    prefer: 'resolution=merge-duplicates,return=representation',
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`conversation_upsert_failed:${text || response.status}`);
  }
  let payload = [];
  try {
    payload = await response.json();
  } catch {
    payload = [];
  }
  const inserted = Array.isArray(payload) ? payload[0] || row : row;
  return inserted.id;
};

const insertSupportMessage = async ({
  conversationId,
  senderType,
  content,
  metadata = {},
  keyRef = '',
  dek = '',
}) => {
  const payloadMetadata = metadata && typeof metadata === 'object' ? { ...metadata } : {};
  let storedContent = String(content || '');
  if (keyRef && dek && storedContent) {
    const encryptedEnvelope = await encryptPlaintextWithDek(
      storedContent,
      dek,
      JSON.stringify({ keyRef, conversationId, senderType, kind: 'support_message' })
    );
    storedContent = '[encrypted]';
    payloadMetadata.keyRef = keyRef;
    payloadMetadata.encryptedEnvelope = encryptedEnvelope;
    payloadMetadata.enc_v = 1;
  }
  return supabaseInsert('support_messages', {
    id: newId(),
    conversation_id: conversationId,
    sender_type: senderType,
    content: storedContent,
    metadata: payloadMetadata,
  });
};

const returnFallback = async ({
  reqId,
  threadId,
  userId,
  senderName,
  userMessage,
  errorCode,
  conversationId,
  keyRef,
  dek,
}) => {
  const systemMsg = buildSystemMessage({ threadId, ticketId: null });
  const missing = [];
  const { url, serviceRoleKey } = getSupabaseConfig();
  if (!url) missing.push('SUPABASE_URL');
  if (!serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');

  let ticketId = null;
  try {
    if (url && serviceRoleKey) {
      ticketId = await createSupportTicket({
        threadId,
        userId,
        userName: senderName,
        message: userMessage,
      });
      if (conversationId && trim(userId)) {
        await supabaseInsert('support_actions', {
          id: newId(),
          conversation_id: conversationId,
          user_id: userId,
          action_type: 'create_support_ticket',
          status: 'executed',
          request: { category: 'handoff', summary: 'AI fallback ticket', details: userMessage },
          result: { ticketId, reason: errorCode },
        });
      }
      systemMsg.message = buildSystemMessage({ threadId, ticketId }).message;
    }
  } catch (ticketError) {
    logSupportError(reqId, 'ticket_insert_failed', ticketError);
    return toJsonResponse(200, {
      ok: false,
      error: 'ticket_insert_failed',
      fallback: 'ticket_created',
      ticketId: null,
      messages: [systemMsg],
      requestId: reqId,
    });
  }

  try {
    if (url && serviceRoleKey) {
      const chatPayload =
        keyRef && dek
          ? await buildEncryptedChatPayload({
              msg: systemMsg,
              keyRef,
              dek,
            })
          : systemMsg;
      await supabaseInsert('chats', buildChatMessageRow(chatPayload));
      if (conversationId) {
        await insertSupportMessage({
          conversationId,
          senderType: 'system',
          content: systemMsg.message,
          metadata: { ticketId, fallback: true, reqId },
          keyRef,
          dek,
        });
        await supabaseUpdate({
          table: 'support_conversations',
          query: `id=eq.${conversationId}`,
          patch: { status: 'pending_human' },
        });
      }
    }
  } catch (chatError) {
    logSupportError(reqId, 'chat_insert_failed', chatError);
  }

  const payload = {
    ok: false,
    error: errorCode,
    ...(missing.length ? { missing } : {}),
    fallback: 'ticket_created',
    ticketId,
    messages: [systemMsg],
    requestId: reqId,
  };
  return toJsonResponse(200, payload);
};

export const handler = async (event) => {
  const method = (event?.httpMethod || 'GET').toUpperCase();
  const reqId = trim(event?.headers?.['x-nf-request-id'] || event?.headers?.['X-Nf-Request-Id']);

  if (method === 'OPTIONS') {
    return toJsonResponse(200, {
      ok: true,
      requestId: reqId,
    });
  }

  if (method !== 'POST') {
    return toJsonResponse(200, {
      ok: false,
      error: 'method_not_allowed',
      messages: [],
      requestId: reqId,
    });
  }

  try {
    let body = {};
    try {
      body = JSON.parse(event?.body || '{}');
    } catch {
      return toJsonResponse(200, {
        ok: false,
        error: 'invalid_body',
        messages: [],
        requestId: reqId,
      });
    }

    const rawUserMessage = trim(body?.message);
    const incomingEnvelope = body?.encryptedEnvelope;

    const suppliedConversationId = trim(body?.conversationId);
    const anonSessionId = trim(body?.anonSessionId || '');
    const accessToken = parseBearerToken(getHeader(event, 'Authorization'));
    const authUser = await fetchAuthUserFromToken(accessToken);
    const bodyUserId = trim(body?.userId || '');
    const userId = isUuid(authUser?.id) ? trim(authUser.id) : isUuid(bodyUserId) ? bodyUserId : '';
    const threadId = trim(body?.threadId || userId || `anon_${Date.now()}`);
    const senderName = trim(body?.senderName || authUser?.email || 'Customer');
    const clientMessageId = trim(body?.clientMessageId || `msg_${Date.now()}_user`);
    const keyRef = trim(body?.keyRef || threadId);
    const { url, serviceRoleKey } = getSupabaseConfig();
    if (!url || !serviceRoleKey) {
      return toJsonResponse(200, {
        ok: false,
        error: 'missing_env',
        missing: [
          ...(url ? [] : ['SUPABASE_URL']),
          ...(serviceRoleKey ? [] : ['SUPABASE_SERVICE_ROLE_KEY']),
        ],
        fallback: 'ticket_created',
        conversationId: suppliedConversationId || threadId,
        messages: [buildSystemMessage({ threadId, ticketId: null })],
        requestId: reqId,
      });
    }
    const conversationId = await upsertConversation({
      conversationId: suppliedConversationId,
      userId,
      anonSessionId,
    });
    let dek = '';
    try {
      dek = await getOrCreateConversationDek({
        keyRef,
        userId,
        anonSessionId,
      });
    } catch (error) {
      logSupportError(reqId, 'encryption_key_failed', error);
      return await returnFallback({
        reqId,
        threadId,
        userId,
        senderName,
        userMessage: rawUserMessage || 'support request',
        errorCode: 'ticket_created',
        conversationId,
      });
    }

    let userMessage = rawUserMessage;
    if (isEncryptedEnvelope(incomingEnvelope)) {
      try {
        userMessage = trim(await decryptEnvelopeWithDek(incomingEnvelope, dek));
      } catch {
        return toJsonResponse(200, {
          ok: false,
          error: 'invalid_encrypted_payload',
          messages: [],
          requestId: reqId,
        });
      }
    }
    if (!userMessage) {
      return toJsonResponse(200, {
        ok: false,
        error: 'message_required',
        messages: [],
        requestId: reqId,
      });
    }

    const userMsg = {
      id: clientMessageId,
      senderId: userId || anonSessionId || 'anon',
      senderName,
      role: 'CUSTOMER',
      message: userMessage,
      timestamp: Date.now(),
      type: 'CUSTOMER_SUPPORT',
      threadId,
    };

    try {
      const encryptedUserMsg = await buildEncryptedChatPayload({
        msg: userMsg,
        keyRef,
        dek,
      });
      await supabaseInsert('chats', buildChatMessageRow(encryptedUserMsg));
      await insertSupportMessage({
        conversationId,
        senderType: 'user',
        content: userMessage,
        metadata: {
          threadId,
          senderName,
          clientMessageId,
          keyRef,
          userId: userId || null,
          anonSessionId: userId ? null : anonSessionId || null,
        },
        keyRef,
        dek,
      });
      await notifyAdminsForSupportMessage({
        threadId,
        messageId: userMsg.id,
        senderName,
        message: userMessage,
      });
    } catch (error) {
      logSupportError(reqId, 'user_message_insert_failed', error);
      return await returnFallback({
        reqId,
        threadId,
        userId,
        senderName,
        userMessage,
        errorCode: 'ticket_created',
        conversationId,
        keyRef,
        dek,
      });
    }

    if (containsForbiddenRequest(userMessage)) {
      const refusalMsg = {
        id: `msg_${Date.now()}_system`,
        senderId: 'system',
        senderName: 'P3 Support',
        role: 'SUPPORT',
        message:
          'I cannot perform that action in chat. I can create a support ticket so an admin can review it safely.',
        timestamp: Date.now(),
        type: 'CUSTOMER_SUPPORT',
        threadId,
      };
      const encryptedRefusalMsg = await buildEncryptedChatPayload({
        msg: refusalMsg,
        keyRef,
        dek,
      });
      await supabaseInsert('chats', buildChatMessageRow(encryptedRefusalMsg));
      await insertSupportMessage({
        conversationId,
        senderType: 'system',
        content: refusalMsg.message,
        metadata: { forbidden: true },
        keyRef,
        dek,
      });
      return await returnFallback({
        reqId,
        threadId,
        userId,
        senderName,
        userMessage,
        errorCode: 'forbidden_request',
        conversationId,
        keyRef,
        dek,
      });
    }

    const toolIntent = detectToolIntent(userMessage);
    if (toolIntent.tool === 'propose_update_profile' || toolIntent.tool === 'propose_set_notifications') {
      if (!userId) {
        const msg = {
          id: `msg_${Date.now()}_system`,
          senderId: 'system',
          senderName: 'P3 Support',
          role: 'SUPPORT',
          message: 'Please sign in to make account changes. I can still answer questions.',
          timestamp: Date.now(),
          type: 'CUSTOMER_SUPPORT',
          threadId,
        };
        const encryptedMsg = await buildEncryptedChatPayload({
          msg,
          keyRef,
          dek,
        });
        await supabaseInsert('chats', buildChatMessageRow(encryptedMsg));
        await insertSupportMessage({
          conversationId,
          senderType: 'system',
          content: msg.message,
          metadata: { deniedReason: 'auth_required' },
          keyRef,
          dek,
        });
        return toJsonResponse(200, {
          ok: true,
          conversationId,
          messages: [msg],
          requestId: reqId,
        });
      }

      const proposedAction = await supabaseInsert('support_actions', {
        id: newId(),
        conversation_id: conversationId,
        user_id: userId,
        action_type: toolIntent.tool,
        status: 'proposed',
        request: {
          fields: toolIntent.fields,
          summary: toolIntent.summary,
          source: 'support_message',
          threadId,
          keyRef,
          userMessage,
        },
        result: { audit: 'proposal_created' },
      });

      const proposalMsg = {
        id: `msg_${Date.now()}_system`,
        senderId: 'system',
        senderName: 'P3 Support',
        role: 'SUPPORT',
        message: `${toolIntent.summary}. Please confirm or cancel this change.`,
        timestamp: Date.now(),
        type: 'CUSTOMER_SUPPORT',
        threadId,
      };
      const encryptedProposalMsg = await buildEncryptedChatPayload({
        msg: proposalMsg,
        keyRef,
        dek,
      });
      await supabaseInsert('chats', buildChatMessageRow(encryptedProposalMsg));
      await insertSupportMessage({
        conversationId,
        senderType: 'system',
        content: proposalMsg.message,
        metadata: {
          actionId: proposedAction?.id || null,
          actionType: toolIntent.tool,
          fields: toolIntent.fields,
          requiresConfirmation: true,
        },
        keyRef,
        dek,
      });

      return toJsonResponse(200, {
        ok: true,
        conversationId,
        requestId: reqId,
        messages: [proposalMsg],
        actionProposal: {
          actionId: proposedAction?.id || '',
          actionType: toolIntent.tool,
          summary: toolIntent.summary,
          fields: toolIntent.fields,
          requiresConfirmation: true,
        },
      });
    }

    let aiReply = '';
    let handoffRequired = shouldForceHandoff(userMessage);
    const accountContext = userId ? await getMinimalAccountContext(userId) : null;
    if (!handoffRequired) {
      try {
        aiReply = await generateAiReply({ userMessage, accountContext });
      } catch (error) {
        logSupportError(reqId, 'ai_failed', error);
        handoffRequired = true;
      }
    }

    if (handoffRequired || !trim(aiReply)) {
      return await returnFallback({
        reqId,
        threadId,
        userId,
        senderName,
        userMessage,
        errorCode: resolveAiProvider() ? 'ai_failed' : 'missing_env',
        conversationId,
        keyRef,
        dek,
      });
    }

    const aiMsg = {
      id: `msg_${Date.now()}_ai`,
      senderId: 'ai_support_agent',
      senderName: 'P3 Support Agent',
      role: 'SUPPORT',
      message: aiReply,
      timestamp: Date.now(),
      type: 'CUSTOMER_SUPPORT',
      threadId,
    };

    try {
      const encryptedAiMsg = await buildEncryptedChatPayload({
        msg: aiMsg,
        keyRef,
        dek,
      });
      await supabaseInsert('chats', buildChatMessageRow(encryptedAiMsg));
      await insertSupportMessage({
        conversationId,
        senderType: 'ai',
        content: aiReply,
        metadata: {
          provider: resolveAiProvider()?.provider || 'unknown',
        },
        keyRef,
        dek,
      });
    } catch (error) {
      logSupportError(reqId, 'ai_message_insert_failed', error);
      return await returnFallback({
        reqId,
        threadId,
        userId,
        senderName,
        userMessage,
        errorCode: 'ticket_created',
        conversationId,
        keyRef,
        dek,
      });
    }

    return toJsonResponse(200, {
      ok: true,
      conversationId,
      ticketId: null,
      messages: [aiMsg],
      requestId: reqId,
    });
  } catch (error) {
    logSupportError(reqId, 'unhandled', error);
    return toJsonResponse(200, {
      ok: false,
      error: 'internal_error',
      messages: [
        buildSystemMessage({
          threadId: `fallback_${Date.now()}`,
          ticketId: null,
          text: 'Support is temporarily unavailable. Please try again shortly.',
        }),
      ],
      requestId: reqId,
    });
  }
};
