const {
  rpcMock,
  fromMock,
  getSessionMock,
} = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
  getSessionMock: vi.fn(),
}));

vi.mock('../../supabaseClient', () => ({
  supabase: {
    rpc: rpcMock,
    from: fromMock,
    auth: {
      getSession: getSessionMock,
    },
  },
}));

import { PersistenceService } from '../../services/persistence';

describe('PersistenceService admin waitlist proxy calls', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    rpcMock.mockReset();
    fromMock.mockReset();
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: 'supabase-access-token',
        },
      },
    });
  });

  it('routes waitlist queue fetch through the Netlify admin proxy', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => null },
      json: async () => ({
        success: true,
        data: [
          {
            id: 'wait_1',
            name: 'Alice',
            email: 'alice@example.com',
            status: 'PENDING',
            created_at: '2026-02-18T00:00:00.000Z',
          },
        ],
      }),
    });

    const rows = await PersistenceService.getAdminWaitlist(
      'admin@p3lending.space',
      'Admin',
      1,
      500
    );

    expect(rows).toHaveLength(1);
    const [url, options] = fetchMock.mock.calls[0];
    const parsed = new URL(String(url), 'https://p3lending.space');
    expect(parsed.pathname).toBe('/.netlify/functions/admin_waitlist_proxy');
    expect(parsed.searchParams.get('path')).toBe('/api/admin/waitlist');
    expect(parsed.searchParams.get('page')).toBe('1');
    expect(parsed.searchParams.get('pageSize')).toBe('500');
    expect(options.headers.Authorization).toBe('Bearer supabase-access-token');
    expect(options.headers['x-admin-email']).toBe('admin@p3lending.space');
  });

  it('routes manual invite requests through proxy manual-invite path', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => null },
      json: async () => ({
        success: true,
        data: {
          id: 'wait_2',
          email: 'manual@example.com',
          name: 'Manual User',
          status: 'INVITED',
          created: true,
        },
      }),
    });

    const result = await PersistenceService.manualInviteAdminWaitlist(
      'admin@p3lending.space',
      'Admin',
      'Manual@Example.com',
      'Manual User'
    );

    expect(result.status).toBe('INVITED');
    const [url, options] = fetchMock.mock.calls[0];
    const parsed = new URL(String(url), 'https://p3lending.space');
    expect(parsed.pathname).toBe('/.netlify/functions/admin_waitlist_proxy');
    expect(parsed.searchParams.get('path')).toBe('/api/admin/waitlist/manual-invite');
    expect(options.method).toBe('POST');
    const payload = JSON.parse(String(options.body || '{}'));
    expect(payload.adminEmail).toBe('admin@p3lending.space');
    expect(payload.email).toBe('manual@example.com');
    expect(payload.name).toBe('Manual User');
  });

  it('throws without making request when no Supabase session', async () => {
    getSessionMock.mockResolvedValueOnce({ data: { session: null } });

    await expect(
      PersistenceService.syncAdminWaitlist('admin@test.com', 'Admin')
    ).rejects.toThrow('Session expired, please sign in again.');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
