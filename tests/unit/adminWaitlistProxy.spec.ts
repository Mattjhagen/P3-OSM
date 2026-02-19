import { handler } from '../../netlify/functions/admin_waitlist_proxy.js';

describe('admin_waitlist_proxy', () => {
  const fetchMock = vi.fn();
  const toBase64Url = (value: string) =>
    Buffer.from(value, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  const buildJwtWithIssuer = (issuer: string) => {
    const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = toBase64Url(JSON.stringify({ iss: issuer, sub: 'test-user' }));
    return `${header}.${payload}.signature`;
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();

    process.env.BACKEND_URL = 'https://backend.example.com';
    process.env.ADMIN_INTERNAL_BEARER = 'internal-secret';
    process.env.SUPABASE_URL = 'https://mxwousrkbdttlgsfqjsk.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'supabase-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  });

  it('returns 401 when token format is invalid', async () => {
    const response = await handler({
      httpMethod: 'GET',
      queryStringParameters: {
        path: '/api/admin/waitlist',
      },
      headers: {
        authorization: 'Bearer client-token',
      },
    } as any);

    expect(response.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 403 when user has no admin claim and no allowlist entry', async () => {
    const token = buildJwtWithIssuer('https://mxwousrkbdttlgsfqjsk.supabase.co/auth/v1');
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'u_1', email: 'member@p3lending.space', app_metadata: {} }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );

    const response = await handler({
      httpMethod: 'POST',
      queryStringParameters: {
        path: '/api/admin/waitlist/manual-invite',
      },
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: '{}',
    } as any);

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body)).toMatchObject({
      success: false,
      error: 'Not authorized.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [allowlistUrl] = fetchMock.mock.calls[1];
    expect(String(allowlistUrl)).toContain('/rest/v1/admin_allowlist');
  });

  it('validates Supabase user and forwards to Render with internal bearer', async () => {
    const token = buildJwtWithIssuer('https://mxwousrkbdttlgsfqjsk.supabase.co/auth/v1');
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'user_1', email: 'admin@p3lending.space', app_metadata: {} }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: 'allow_1', email: 'admin@p3lending.space', role: 'ADMIN', is_active: true }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );

    const response = await handler({
      httpMethod: 'GET',
      queryStringParameters: {
        path: '/api/admin/waitlist',
        page: '1',
        pageSize: '500',
      },
      headers: {
        authorization: `Bearer ${token}`,
        'x-admin-email': 'admin@p3lending.space',
      },
    } as any);

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(JSON.stringify({ success: true, data: [] }));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [supabaseUrl, supabaseOptions] = fetchMock.mock.calls[0];
    expect(String(supabaseUrl)).toContain('/auth/v1/user');
    expect(supabaseOptions.headers.Authorization).toBe(`Bearer ${token}`);
    expect(supabaseOptions.headers.apikey).toBe('supabase-anon-key');
    expect(supabaseOptions.headers.Accept).toBe('application/json');

    const [allowlistUrl, allowlistOptions] = fetchMock.mock.calls[1];
    expect(String(allowlistUrl)).toContain('/rest/v1/admin_allowlist');
    expect(allowlistOptions.headers.Authorization).toBe('Bearer service-key');

    const [renderUrl, renderOptions] = fetchMock.mock.calls[2];
    const parsedRenderUrl = new URL(String(renderUrl));
    expect(parsedRenderUrl.pathname).toBe('/api/admin/waitlist');
    expect(renderOptions.headers.Authorization).toBe('Bearer internal-secret');
    expect(renderOptions.headers.Authorization).not.toContain('client-token');
  });

  it('passes through Render error status and body verbatim', async () => {
    const token = buildJwtWithIssuer('https://mxwousrkbdttlgsfqjsk.supabase.co/auth/v1');
    const renderErrorBody = JSON.stringify({
      success: false,
      error: 'This user is already onboarded and does not need an invite.',
    });

    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'user_1', email: 'admin@p3lending.space', app_metadata: {} }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: 'allow_1', email: 'admin@p3lending.space', role: 'ADMIN', is_active: true }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(renderErrorBody, {
          status: 409,
          headers: { 'content-type': 'application/json' },
        })
      );

    const response = await handler({
      httpMethod: 'POST',
      queryStringParameters: {
        path: '/api/admin/waitlist/manual-invite',
      },
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email: 'onboarded@example.com' }),
    } as any);

    expect(response.statusCode).toBe(409);
    expect(response.body).toBe(renderErrorBody);
  });
});
