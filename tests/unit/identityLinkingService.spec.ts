const { getUserMock, getSessionMock, linkIdentityMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  getSessionMock: vi.fn(),
  linkIdentityMock: vi.fn(),
}));

vi.mock('../../supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: getUserMock,
      getSession: getSessionMock,
      linkIdentity: linkIdentityMock,
    },
  },
}));

import { IdentityLinkingService } from '../../services/identityLinkingService';

const createWindowMock = () => {
  const storage = new Map<string, string>();
  const assign = vi.fn();

  return {
    location: {
      origin: 'https://p3lending.space',
      assign,
    },
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, String(value));
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    },
  };
};

describe('IdentityLinkingService', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    getSessionMock.mockReset();
    linkIdentityMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('returns linked providers from auth user identities', async () => {
    getUserMock.mockResolvedValueOnce({
      data: {
        user: {
          email: 'member@example.com',
          identities: [{ provider: 'google' }, { provider: 'email' }],
        },
      },
      error: null,
    });

    const providers = await IdentityLinkingService.getLinkedProviders();
    expect(providers).toContain('email');
    expect(providers).toContain('google');
    expect(providers).not.toContain('apple');
  });

  it('starts manual link with Supabase redirect URL and provider', async () => {
    const windowMock = createWindowMock();
    vi.stubGlobal('window', windowMock);

    getSessionMock.mockResolvedValueOnce({
      data: {
        session: {
          user: { id: '550e8400-e29b-41d4-a716-446655440000' },
        },
      },
      error: null,
    });

    linkIdentityMock.mockResolvedValueOnce({
      data: { url: 'https://supabase.example/auth/link' },
      error: null,
    });

    await IdentityLinkingService.startManualLink('google');

    expect(linkIdentityMock).toHaveBeenCalledTimes(1);
    expect(linkIdentityMock).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: expect.stringContaining('/auth/callback'),
      },
    });

    const redirect = String(linkIdentityMock.mock.calls[0][0].options.redirectTo);
    expect(redirect).toContain('intent=manual_identity_link');
    expect(redirect).toContain('provider=google');
    expect(redirect).toContain('next=%2Fdashboard%3Fview%3Dprofile');
    expect(windowMock.location.assign).toHaveBeenCalledWith(
      'https://supabase.example/auth/link'
    );
  });

  it('persists and consumes one-time linking results', () => {
    const windowMock = createWindowMock();
    vi.stubGlobal('window', windowMock);

    IdentityLinkingService.persistResult({
      status: 'success',
      provider: 'apple',
      message: 'Linked',
      at: '2026-02-19T00:00:00.000Z',
    });

    const consumed = IdentityLinkingService.consumeResult();
    expect(consumed).toEqual({
      status: 'success',
      provider: 'apple',
      message: 'Linked',
      at: '2026-02-19T00:00:00.000Z',
    });

    const secondRead = IdentityLinkingService.consumeResult();
    expect(secondRead).toBeNull();
  });
});
