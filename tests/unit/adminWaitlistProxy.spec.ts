import { handler } from '../../netlify/functions/admin_waitlist_proxy.js';

describe('admin_waitlist_proxy', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();

    process.env.RENDER_API_BASE = 'https://p3-lending-protocol.onrender.com';
    process.env.ADMIN_INTERNAL_BEARER = 'internal-secret';
    process.env.ADMIN_ALLOWED_EMAILS = 'admin@p3lending.space';
    process.env.SUPABASE_URL = 'https://mxwousrkbdttlgsfqjsk.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'supabase-anon-key';
  });

  it('rejects non-waitlist admin paths', async () => {
    const response = await handler({
      httpMethod: 'GET',
      queryStringParameters: {
        path: '/api/admin/stats',
      },
      headers: {
        authorization: 'Bearer client-token',
      },
    } as any);

    expect(response.statusCode).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires JSON content type only for POST requests', async () => {
    const response = await handler({
      httpMethod: 'POST',
      queryStringParameters: {
        path: '/api/admin/waitlist/manual-invite',
      },
      headers: {
        authorization: 'Bearer client-token',
        'content-type': 'text/plain',
      },
      body: '{}',
    } as any);

    expect(response.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('validates Supabase user and forwards to Render with internal bearer', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ email: 'admin@p3lending.space' }), {
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
        authorization: 'Bearer client-token',
        'x-admin-email': 'admin@p3lending.space',
      },
    } as any);

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(JSON.stringify({ success: true, data: [] }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [supabaseUrl, supabaseOptions] = fetchMock.mock.calls[0];
    expect(String(supabaseUrl)).toContain('/auth/v1/user');
    expect(supabaseOptions.headers.Authorization).toBe('Bearer client-token');
    expect(supabaseOptions.headers.apikey).toBe('supabase-anon-key');
    expect(supabaseOptions.headers.Accept).toBe('application/json');

    const [renderUrl, renderOptions] = fetchMock.mock.calls[1];
    const parsedRenderUrl = new URL(String(renderUrl));
    expect(parsedRenderUrl.pathname).toBe('/api/admin/waitlist');
    expect(parsedRenderUrl.searchParams.get('page')).toBe('1');
    expect(parsedRenderUrl.searchParams.get('pageSize')).toBe('500');
    expect(parsedRenderUrl.searchParams.get('adminEmail')).toBe('admin@p3lending.space');
    expect(renderOptions.headers.Authorization).toBe('Bearer internal-secret');
    expect(renderOptions.headers.Authorization).not.toContain('client-token');
  });

  it('passes through Render error status and body verbatim', async () => {
    const renderErrorBody = JSON.stringify({
      success: false,
      error: 'This user is already onboarded and does not need an invite.',
    });

    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ email: 'admin@p3lending.space' }), {
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
        authorization: 'Bearer client-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email: 'onboarded@example.com' }),
    } as any);

    expect(response.statusCode).toBe(409);
    expect(response.body).toBe(renderErrorBody);
  });
});
