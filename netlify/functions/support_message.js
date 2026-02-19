const trim = (value) => String(value || '').trim();

const toJsonResponse = (statusCode, payload) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

const toIso = () => new Date().toISOString();

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

export const handler = async (event) => {
  if ((event?.httpMethod || 'GET').toUpperCase() !== 'POST') {
    return toJsonResponse(405, { success: false, error: 'Method not allowed.' });
  }

  let body = {};
  try {
    body = JSON.parse(event?.body || '{}');
  } catch {
    return toJsonResponse(400, { success: false, error: 'Invalid request body.' });
  }

  const userMessage = trim(body?.message);
  if (!userMessage) {
    return toJsonResponse(400, { success: false, error: 'message is required.' });
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
    await supabaseInsert('chats', buildChatMessageRow(userMsg));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to persist user message.';
    return toJsonResponse(500, { success: false, error: message });
  }

  let aiReply = '';
  let handoffRequired = shouldForceHandoff(userMessage);

  if (!handoffRequired) {
    try {
      aiReply = await generateAiReply(userMessage);
      if (aiReply === 'HANDOFF_REQUIRED') {
        handoffRequired = true;
      }
    } catch {
      handoffRequired = true;
    }
  }

  if (handoffRequired) {
    try {
      const ticketId = await createSupportTicket({
        threadId,
        userId,
        userName: senderName,
        message: userMessage,
      });

      const systemMsg = {
        id: `msg_${Date.now()}_system`,
        senderId: 'system',
        senderName: 'P3 Support',
        role: 'SUPPORT',
        message: `We're creating a support ticket for you. Ticket ID: ${ticketId}. A human will reply shortly.`,
        timestamp: Date.now(),
        type: 'CUSTOMER_SUPPORT',
        threadId,
      };

      await supabaseInsert('chats', buildChatMessageRow(systemMsg));

      return toJsonResponse(200, {
        success: true,
        data: {
          conversationId: threadId,
          ticketId,
          ticketStatus: 'pending_human',
          messages: [systemMsg],
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create support ticket.';
      return toJsonResponse(500, { success: false, error: message });
    }
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
    const message = error instanceof Error ? error.message : 'Failed to persist AI response.';
    return toJsonResponse(500, { success: false, error: message });
  }

  return toJsonResponse(200, {
    success: true,
    data: {
      conversationId: threadId,
      ticketStatus: 'none',
      messages: [aiMsg],
    },
  });
};
