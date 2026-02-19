// @ts-nocheck
import { handler as statusHandler } from '../../netlify/functions/status_check.js';

describe('status_check function', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('returns degraded supabase when env vars are missing', async () => {
    process.env.FRONTEND_STATUS_URL = 'https://p3lending.space';
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_ANON_KEY;
    delete process.env.BACKEND_URL;
    delete process.env.VITE_BACKEND_URL;
    delete process.env.RENDER_API_BASE;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    globalThis.fetch = fetchMock as any;

    const response = await statusHandler({ httpMethod: 'GET' } as any);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.services.frontend.ok).toBe(true);
    expect(body.services.functions.ok).toBe(true);
    expect(body.services.supabaseRest.error).toBe('missing_env');
    expect(body.ok).toBe(false);
  });

  it('returns all green when all probes are healthy', async () => {
    process.env.FRONTEND_STATUS_URL = 'https://p3lending.space';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    delete process.env.BACKEND_URL;
    delete process.env.VITE_BACKEND_URL;
    delete process.env.RENDER_API_BASE;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    globalThis.fetch = fetchMock as any;

    const response = await statusHandler({ httpMethod: 'GET' } as any);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.services.supabaseRest.ok).toBe(true);
    expect(body.netlifyBadge.imageUrl).toContain('/deploy-status');
  });
});
