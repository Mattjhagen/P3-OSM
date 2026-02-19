// @ts-nocheck

import { handler } from '../../netlify/functions/support_action_confirm.js';

describe('support_action_confirm function', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://supabase.example.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    process.env.CHAT_ESCROW_SECRET = 'test-escrow-secret';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('returns 401 when not logged in', async () => {
    globalThis.fetch = vi.fn(async (url: string) => {
      if (String(url).includes('/auth/v1/user')) {
        return { ok: false, status: 401, json: async () => ({}) };
      }
      return { ok: true, json: async () => [] };
    }) as any;

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ actionId: 'a1', confirm: true }),
    } as any);
    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('auth_required');
  });

  it('cancels proposed action when confirm=false', async () => {
    const fetchMock = vi.fn(async (url: string, init: any) => {
      const rawUrl = String(url);
      if (rawUrl.includes('/auth/v1/user')) {
        return { ok: true, json: async () => ({ id: 'u-1' }) };
      }
      if (rawUrl.includes('/rest/v1/support_actions?select=*')) {
        return {
          ok: true,
          json: async () => [
            {
              id: 'act-1',
              user_id: 'u-1',
              status: 'proposed',
              action_type: 'propose_update_profile',
              conversation_id: 'conv-1',
              request: { fields: { phone: '402-555-1234' }, threadId: 'u-1' },
            },
          ],
        };
      }
      if (
        rawUrl.includes('/rest/v1/support_actions?id=eq.act-1') ||
        rawUrl.includes('/rest/v1/support_messages') ||
        rawUrl.includes('/rest/v1/chats')
      ) {
        return { ok: true, json: async () => [{}] };
      }
      return { ok: true, json: async () => [] };
    });
    globalThis.fetch = fetchMock as any;

    const response = await handler({
      httpMethod: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: JSON.stringify({ actionId: 'act-1', confirm: false }),
    } as any);
    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.action.status).toBe('cancelled');
  });

  it('executes profile update when confirm=true', async () => {
    const fetchMock = vi.fn(async (url: string, init: any) => {
      const rawUrl = String(url);
      if (rawUrl.includes('/auth/v1/user')) {
        return { ok: true, json: async () => ({ id: 'u-1' }) };
      }
      if (rawUrl.includes('/rest/v1/support_actions?select=*')) {
        return {
          ok: true,
          json: async () => [
            {
              id: 'act-2',
              user_id: 'u-1',
              status: 'proposed',
              action_type: 'propose_update_profile',
              conversation_id: 'conv-1',
              request: { fields: { display_name: 'Alice Smith' }, threadId: 'u-1' },
            },
          ],
        };
      }
      if (rawUrl.includes('/rest/v1/users?select=id,data')) {
        return { ok: true, json: async () => [{ id: 'u-1', data: { name: 'Old Name' } }] };
      }
      if (
        rawUrl.includes('/rest/v1/support_actions?id=eq.act-2') ||
        rawUrl.includes('/rest/v1/users?id=eq.u-1') ||
        rawUrl.includes('/rest/v1/support_messages') ||
        rawUrl.includes('/rest/v1/chats')
      ) {
        return { ok: true, json: async () => [{}] };
      }
      return { ok: true, json: async () => [] };
    });
    globalThis.fetch = fetchMock as any;

    const response = await handler({
      httpMethod: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: JSON.stringify({ actionId: 'act-2', confirm: true }),
    } as any);
    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.action.status).toBe('executed');
  });
});
