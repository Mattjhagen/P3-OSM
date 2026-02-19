// @ts-nocheck
import { handler as vapidHandler } from '../../netlify/functions/push_vapid_public.js';
import { handler as notifyHandler } from '../../netlify/functions/push_notify_admins.js';

describe('push function basics', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('returns public vapid key payload', async () => {
    process.env.VAPID_PUBLIC_KEY = 'public-vapid-key';
    const response = await vapidHandler({ httpMethod: 'GET' } as any);
    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.publicKey).toBe('public-vapid-key');
  });

  it('rejects notify request without secret', async () => {
    process.env.PUSH_NOTIFY_SECRET = 'expected-secret';
    const response = await notifyHandler({
      httpMethod: 'POST',
      headers: { 'x-push-secret': 'wrong-secret' },
      body: '{}',
    } as any);
    const body = JSON.parse(response.body);
    expect(response.statusCode).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('unauthorized');
  });
});
