// @ts-nocheck
import crypto from 'crypto';
import { handler } from '../../netlify/functions/slack_webhook.js';

const signRequest = (secret, timestamp, body) => {
  const base = `v0:${timestamp}:${body}`;
  return `v0=${crypto.createHmac('sha256', secret).update(base).digest('hex')}`;
};

const makeEvent = ({ body, secret, timestamp = '1700000000' }) => ({
  httpMethod: 'POST',
  body,
  headers: {
    'x-slack-request-timestamp': timestamp,
    'x-slack-signature': signRequest(secret, timestamp, body),
    'content-type': 'application/x-www-form-urlencoded',
  },
});

describe('slack_webhook function', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(1700000000 * 1000);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('rejects invalid Slack signatures', async () => {
    process.env.SLACK_SIGNING_SECRET = 'test-secret';
    const body = 'command=%2Floan-status&text=abc-123&user_name=matt';
    const event = {
      ...makeEvent({ body, secret: 'wrong-secret' }),
      headers: {
        'x-slack-request-timestamp': '1700000000',
        'x-slack-signature': 'v0=invalid',
      },
    };

    const response = await handler(event as any);
    const payload = JSON.parse(response.body);

    expect(response.statusCode).toBe(401);
    expect(payload.error).toBe('invalid_signature');
  });

  it('returns loan status for /loan-status command', async () => {
    process.env.SLACK_SIGNING_SECRET = 'test-secret';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'loan-123',
          status: 'active',
          amount_usd: '500',
          interest_rate: '8',
          due_date: '2026-03-01T00:00:00.000Z',
          updated_at: '2026-02-18T10:00:00.000Z',
          created_at: '2026-02-15T10:00:00.000Z',
        },
      ],
    });

    const body = 'command=%2Floan-status&text=loan-123&user_name=matt';
    const event = makeEvent({ body, secret: 'test-secret' });
    const response = await handler(event as any);
    const payload = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(payload.response_type).toBe('ephemeral');
    expect(payload.text).toContain('loan-123');
    expect(payload.text).toContain('active');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns in-channel message for /tip command', async () => {
    process.env.SLACK_SIGNING_SECRET = 'test-secret';
    const body = 'command=%2Ftip&text=%40alex%2012.5%20thanks&user_name=matt';
    const event = makeEvent({ body, secret: 'test-secret' });

    const response = await handler(event as any);
    const payload = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(payload.response_type).toBe('in_channel');
    expect(payload.text).toContain('matt tipped @alex');
    expect(payload.text).toContain('$12.50');
  });

  it('returns help blocks for /help command', async () => {
    process.env.SLACK_SIGNING_SECRET = 'test-secret';
    const body = 'command=%2Fhelp&text=&user_name=matt';
    const event = makeEvent({ body, secret: 'test-secret' });

    const response = await handler(event as any);
    const payload = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(payload.response_type).toBe('ephemeral');
    expect(payload.text).toContain('Slash commands');
    expect(payload.blocks).toBeDefined();
    expect(payload.blocks.length).toBeGreaterThan(0);
  });
});
