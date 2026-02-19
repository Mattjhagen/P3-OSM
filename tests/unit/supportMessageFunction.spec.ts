// @ts-nocheck

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

  it('returns ok:true with AI message for normal support questions', async () => {
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
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.messages[0].senderId).toBe('ai_support_agent');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('returns fallback ticket_created when AI request fails', async () => {
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
    expect(body.ok).toBe(false);
    expect(body.fallback).toBe('ticket_created');
    expect(body.ticketId).toContain('tick_support_');
    expect(body.messages[0].message).toContain('Ticket ID');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('returns missing_env fallback when Supabase credentials are absent', async () => {
    process.env.SUPABASE_URL = '';
    process.env.SUPABASE_SERVICE_ROLE_KEY = '';
    process.env.OPENAI_API_KEY = '';
    process.env.API_KEY = '';
    process.env.RAW_GEMINI_KEY = '';

    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as any;

    const response = await handler({
      httpMethod: 'POST',
      headers: { 'x-nf-request-id': 'req-missing-env' },
      body: JSON.stringify({
        threadId: 'thread-3',
        userId: 'user-3',
        senderName: 'Casey',
        message: 'hi',
        clientMessageId: 'msg_client_3',
      }),
    } as any);

    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('missing_env');
    expect(Array.isArray(body.missing)).toBe(true);
    expect(body.messages.length).toBeGreaterThanOrEqual(1);
  });

  it('handles OPTIONS preflight with JSON and CORS headers', async () => {
    const response = await handler({
      httpMethod: 'OPTIONS',
      headers: { 'x-nf-request-id': 'req-options' },
    } as any);

    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['access-control-allow-methods']).toContain('OPTIONS');
  });
});
