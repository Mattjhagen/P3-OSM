import { handler } from '../../netlify/functions/admin_waitlist_proxy';

describe('admin_waitlist_proxy', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  const baseEvent = {
    httpMethod: 'POST',
    headers: {},
    queryStringParameters: {
      path: '/api/admin/waitlist/sync',
    },
    body: JSON.stringify({ adminEmail: 'admin@test.com' }),
  };

  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://supabase.example.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    process.env.BACKEND_URL = 'https://backend.example.com';
    process.env.ADMIN_INTERNAL_BEARER = 'internal-secret';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns 401 when auth header is missing', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as any;

    const response = await handler({
      ...baseEvent,
      headers: {},
    } as any);

    expect(response.statusCode).toBe(401);
    expect(response.headers['X-P3-Proxy']).toBe('admin_waitlist_proxy');
    expect(JSON.parse(response.body)).toMatchObject({
      success: false,
      error: 'Missing Supabase session token.',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 401 when Supabase token is invalid', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ message: 'invalid token' }),
    });
    globalThis.fetch = fetchMock as any;

    const response = await handler({
      ...baseEvent,
      headers: { Authorization: 'Bearer bad-token' },
    } as any);

    expect(response.statusCode).toBe(401);
    expect(response.headers['X-P3-Proxy']).toBe('admin_waitlist_proxy');
    expect(JSON.parse(response.body)).toMatchObject({
      success: false,
      error: 'Invalid/expired Supabase session token.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns 403 when user is authenticated but not admin', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'user-1',
          email: 'member@test.com',
          app_metadata: {},
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });
    globalThis.fetch = fetchMock as any;

    const response = await handler({
      ...baseEvent,
      headers: { Authorization: 'Bearer user-token' },
    } as any);

    expect(response.statusCode).toBe(403);
    expect(response.headers['X-P3-Proxy']).toBe('admin_waitlist_proxy');
    expect(JSON.parse(response.body)).toMatchObject({
      success: false,
      error: 'Admin role required.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('forwards with internal bearer when user is admin', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'admin-1',
          email: 'admin@test.com',
          app_metadata: { role: 'admin' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ success: true, data: { synced: true } }),
      });
    globalThis.fetch = fetchMock as any;

    const response = await handler({
      ...baseEvent,
      headers: { Authorization: 'Bearer real-user-token', 'x-admin-email': 'admin@test.com' },
    } as any);

    expect(response.statusCode).toBe(200);
    expect(response.headers['X-P3-Proxy']).toBe('admin_waitlist_proxy');
    expect(JSON.parse(response.body)).toMatchObject({
      success: true,
      data: { synced: true },
    });

    const [, upstreamCall] = fetchMock.mock.calls;
    expect(upstreamCall[1].headers.Authorization).toBe('Bearer internal-secret');
  });

  it('returns GET health response without auth', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as any;

    const response = await handler({
      httpMethod: 'GET',
      headers: {},
      queryStringParameters: null,
      body: null,
    } as any);

    expect(response.statusCode).toBe(200);
    expect(response.headers['X-P3-Proxy']).toBe('admin_waitlist_proxy');
    expect(JSON.parse(response.body)).toEqual({
      ok: true,
      name: 'admin_waitlist_proxy',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
