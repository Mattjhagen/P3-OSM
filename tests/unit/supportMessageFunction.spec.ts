// @ts-nocheck

import { handler } from '../../netlify/functions/support_message.js';

describe('support_message function', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://supabase.example.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    process.env.OPENAI_API_KEY = 'openai-key';
    process.env.OPENAI_MODEL = 'gpt-4o-mini';
    process.env.PUSH_NOTIFY_SECRET = '';
    process.env.URL = '';
    process.env.DEPLOY_PRIME_URL = '';
    process.env.CHAT_ESCROW_SECRET = 'test-escrow-secret';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('returns actionProposal for profile update requests', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const rawUrl = String(url);
      if (rawUrl.includes('/auth/v1/user')) {
        return {
          ok: true,
          json: async () => ({ id: '11111111-1111-4111-8111-111111111111', email: 'alice@example.com' }),
        };
      }
      if (rawUrl.includes('/rest/v1/support_conversations')) {
        return { ok: true, json: async () => [{ id: '22222222-2222-4222-8222-222222222222' }] };
      }
      if (rawUrl.includes('/rest/v1/support_actions')) {
        return { ok: true, json: async () => [{ id: '33333333-3333-4333-8333-333333333333' }] };
      }
      if (rawUrl.includes('/rest/v1/chats') || rawUrl.includes('/rest/v1/support_messages')) {
        return { ok: true, json: async () => [{}] };
      }
      return { ok: true, json: async () => [] };
    });
    globalThis.fetch = fetchMock as any;

    const response = await handler({
      httpMethod: 'POST',
      headers: { Authorization: 'Bearer token123' },
      body: JSON.stringify({
        message: 'Please change my phone to 402-555-1234',
        threadId: 'thread-1',
        clientMessageId: 'client-msg-1',
      }),
    } as any);

    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.actionProposal).toBeTruthy();
    expect(body.actionProposal.actionType).toBe('propose_update_profile');
    expect(body.actionProposal.fields.phone).toContain('402-555-1234');
  });

  it('returns fallback ticket when AI fails', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const rawUrl = String(url);
      if (rawUrl.includes('api.openai.com')) {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      if (rawUrl.includes('/rest/v1/support_conversations')) {
        return { ok: true, json: async () => [{ id: '44444444-4444-4444-8444-444444444444' }] };
      }
      if (rawUrl.includes('/rest/v1/tickets')) {
        return { ok: true, json: async () => [{ id: '55555555-5555-4555-8555-555555555555' }] };
      }
      if (
        rawUrl.includes('/rest/v1/chats') ||
        rawUrl.includes('/rest/v1/support_messages') ||
        rawUrl.includes('/rest/v1/support_conversations?id=eq.')
      ) {
        return { ok: true, json: async () => [{}] };
      }
      return { ok: true, json: async () => [] };
    });
    globalThis.fetch = fetchMock as any;

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({
        message: 'What fees are charged?',
        threadId: 'thread-2',
      }),
    } as any);
    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.fallback).toBe('ticket_created');
    expect(typeof body.ticketId).toBe('string');
    expect(body.ticketId.length).toBeGreaterThan(10);
    const calledUrls = fetchMock.mock.calls.map((args: any[]) => String(args[0]));
    expect(calledUrls.some((url: string) => url.includes('/rest/v1/tickets'))).toBe(true);
    expect(calledUrls.some((url: string) => url.includes('/rest/v1/internal_tickets'))).toBe(false);
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
