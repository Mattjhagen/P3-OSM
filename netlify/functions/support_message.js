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

const getSupabaseConfig = () => ({
  url: trim(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL).replace(/\/+$/, ''),
  serviceRoleKey: trim(process.env.SUPABASE_SERVICE_ROLE_KEY),
});

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

const supabaseInsert = async (table, row) => {
  const { url, serviceRoleKey } = getSupabaseConfig();
  if (!url || !serviceRoleKey) {
    throw new Error('Support function misconfigured: missing Supabase service credentials.');
  }

  const response = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify([row]),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase insert failed (${table}): ${text || response.status}`);
  }
};

const SUPPORT_KB_PROMPT = `
You are the P3 Support assistant for the P3 Lending Protocol.
Answer only using this product knowledge:
- P3 is a lending/investing platform with borrower and lender workflows.
- Core topics: borrowing, investing/marketplace, KYC tiers and verification, waitlist status, onboarding, fees and repayment basics.
- If asked for legal/compliance certainty, account-specific decisions, payouts, or anything requiring staff review, respond with exactly HANDOFF_REQUIRED.
- Keep answers short and actionable.
`;

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

const generateAiReply = async (userMessage) => {
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
            { role: 'system', content: SUPPORT_KB_PROMPT },
            { role: 'user', content: userMessage },
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
                  text: `${SUPPORT_KB_PROMPT}\n\nUser question: ${userMessage}`,
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
  const ticketId = `tick_support_${Date.now()}`;
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

  await supabaseInsert('internal_tickets', {
    id: ticketData.id,
    status: ticketData.status,
    data: ticketData,
  });

  return ticketId;
};

const logSupportError = (reqId, code, error) => {
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  console.error(`[support_message] reqId=${reqId || ''} code=${code} error=${errorName}`);
};

const returnFallback = async ({ reqId, threadId, userId, senderName, userMessage, errorCode }) => {
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
      await supabaseInsert('chats', buildChatMessageRow(systemMsg));
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

    const userMessage = trim(body?.message);
    if (!userMessage) {
      return toJsonResponse(200, {
        ok: false,
        error: 'message_required',
        messages: [],
        requestId: reqId,
      });
    }

    const threadId = trim(body?.threadId || body?.userId || `anon_${Date.now()}`);
    const userId = trim(body?.userId || `anon_${Date.now()}`);
    const senderName = trim(body?.senderName || 'Customer');
    const clientMessageId = trim(body?.clientMessageId || `msg_${Date.now()}_user`);

    const userMsg = {
      id: clientMessageId,
      senderId: userId,
      senderName,
      role: 'CUSTOMER',
      message: userMessage,
      timestamp: Date.now(),
      type: 'CUSTOMER_SUPPORT',
      threadId,
    };

    try {
      const { url, serviceRoleKey } = getSupabaseConfig();
      if (!url || !serviceRoleKey) {
        return await returnFallback({
          reqId,
          threadId,
          userId,
          senderName,
          userMessage,
          errorCode: 'missing_env',
        });
      }
      await supabaseInsert('chats', buildChatMessageRow(userMsg));
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
      });
    }

    let aiReply = '';
    let handoffRequired = shouldForceHandoff(userMessage);

    if (!handoffRequired) {
      try {
        aiReply = await generateAiReply(userMessage);
        if (aiReply === 'HANDOFF_REQUIRED') {
          handoffRequired = true;
        }
      } catch (error) {
        logSupportError(reqId, 'ai_failed', error);
        handoffRequired = true;
      }
    }

    if (handoffRequired) {
      return await returnFallback({
        reqId,
        threadId,
        userId,
        senderName,
        userMessage,
        errorCode: resolveAiProvider() ? 'ai_failed' : 'missing_env',
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
      await supabaseInsert('chats', buildChatMessageRow(aiMsg));
    } catch (error) {
      logSupportError(reqId, 'ai_message_insert_failed', error);
      return await returnFallback({
        reqId,
        threadId,
        userId,
        senderName,
        userMessage,
        errorCode: 'ticket_created',
      });
    }

    return toJsonResponse(200, {
      ok: true,
      conversationId: threadId,
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
