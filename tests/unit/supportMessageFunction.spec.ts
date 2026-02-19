import { handler } from '../../netlify/functions/support_message.js';

describe('support_message function', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://supabase.example.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    process.env.OPENAI_API_KEY = 'openai-key';
    process.env.OPENAI_MODEL = 'gpt-4o-mini';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('returns an AI message for normal support questions', async () => {
    const fetchMock = vi
      .fn()
      // Persist user message
      .mockResolvedValueOnce({ ok: true, text: async () => '', json: async () => [] })
      // OpenAI response
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'P3 lets users borrow and invest with KYC controls.' } }],
        }),
      })
      // Persist AI message
      .mockResolvedValueOnce({ ok: true, text: async () => '', json: async () => [] });

    globalThis.fetch = fetchMock as any;

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({
        threadId: 'thread-1',
        userId: 'user-1',
        senderName: 'Alice',
        message: 'What is P3?',
        clientMessageId: 'msg_client_1',
      }),
    } as any);

    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.ticketStatus).toBe('none');
    expect(body.data.messages[0].senderId).toBe('ai_support_agent');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('creates a human handoff ticket when AI request fails', async () => {
    const fetchMock = vi
      .fn()
      // Persist user message
      .mockResolvedValueOnce({ ok: true, text: async () => '', json: async () => [] })
      // OpenAI fails
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      // Persist ticket
      .mockResolvedValueOnce({ ok: true, text: async () => '', json: async () => [] })
      // Persist system fallback message
      .mockResolvedValueOnce({ ok: true, text: async () => '', json: async () => [] });

    globalThis.fetch = fetchMock as any;

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({
        threadId: 'thread-2',
        userId: 'user-2',
        senderName: 'Bob',
        message: 'I need help from a human.',
        clientMessageId: 'msg_client_2',
      }),
    } as any);

    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.ticketStatus).toBe('pending_human');
    expect(body.data.ticketId).toContain('tick_support_');
    expect(body.data.messages[0].message).toContain('Ticket ID');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
