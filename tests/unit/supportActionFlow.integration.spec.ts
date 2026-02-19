// @ts-nocheck

import { handler as supportMessageHandler } from '../../netlify/functions/support_message.js';
import { handler as confirmHandler } from '../../netlify/functions/support_action_confirm.js';

describe('support action flow integration', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://supabase.example.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    process.env.OPENAI_API_KEY = 'openai-key';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('proposes then confirms profile update', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const state: any = {
      action: null,
      userData: { name: 'Old Name', notification_preferences: { email_opt_in: true, sms_opt_in: false } },
    };

    globalThis.fetch = vi.fn(async (url: string, init: any = {}) => {
      const rawUrl = String(url);
      const method = String(init?.method || 'GET').toUpperCase();
      if (rawUrl.includes('/auth/v1/user')) {
        return { ok: true, json: async () => ({ id: userId, email: 'alice@example.com' }) };
      }
      if (rawUrl.includes('/rest/v1/support_conversations')) {
        return { ok: true, json: async () => [{ id: 'conv-1' }] };
      }
      if (rawUrl.includes('/rest/v1/support_actions?select=*&id=eq.')) {
        return { ok: true, json: async () => (state.action ? [state.action] : []) };
      }
      if (rawUrl.includes('/rest/v1/support_actions') && method === 'POST') {
        const payload = JSON.parse(String(init?.body || '[]'))[0];
        state.action = { ...payload };
        return { ok: true, json: async () => [{ ...payload }] };
      }
      if (rawUrl.includes('/rest/v1/support_actions?id=eq.') && method === 'PATCH') {
        const patch = JSON.parse(String(init?.body || '{}'));
        state.action = { ...state.action, ...patch };
        return { ok: true, json: async () => [state.action] };
      }
      if (rawUrl.includes('/rest/v1/users?select=id,data')) {
        return { ok: true, json: async () => [{ id: userId, data: state.userData }] };
      }
      if (rawUrl.includes(`/rest/v1/users?id=eq.${encodeURIComponent(userId)}`) && method === 'PATCH') {
        const patch = JSON.parse(String(init?.body || '{}'));
        state.userData = patch.data;
        return { ok: true, json: async () => [{ id: userId, data: state.userData }] };
      }
      if (
        rawUrl.includes('/rest/v1/chats') ||
        rawUrl.includes('/rest/v1/support_messages') ||
        rawUrl.includes('/rest/v1/support_conversations?id=eq.')
      ) {
        return { ok: true, json: async () => [{}] };
      }
      return { ok: true, json: async () => [] };
    }) as any;

    const proposalRes = await supportMessageHandler({
      httpMethod: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: JSON.stringify({
        threadId: userId,
        message: 'Set my display name to Alice Smith',
        userId,
      }),
    } as any);
    const proposalBody = JSON.parse(proposalRes.body);
    expect(proposalBody.actionProposal).toBeTruthy();
    expect(proposalBody.actionProposal.actionType).toBe('propose_update_profile');

    const confirmRes = await confirmHandler({
      httpMethod: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: JSON.stringify({
        actionId: proposalBody.actionProposal.actionId,
        confirm: true,
      }),
    } as any);
    const confirmBody = JSON.parse(confirmRes.body);
    expect(confirmBody.ok).toBe(true);
    expect(confirmBody.action.status).toBe('executed');
    expect(state.userData.name).toBe('Alice Smith');
  });
});
