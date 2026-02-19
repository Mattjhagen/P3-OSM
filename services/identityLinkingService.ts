import { supabase } from '../supabaseClient';

export type SupportedIdentityProvider = 'email' | 'google' | 'apple';
export type OAuthLinkProvider = Extract<SupportedIdentityProvider, 'google' | 'apple'>;

export type IdentityLinkResult = {
  status: 'success' | 'error';
  provider: OAuthLinkProvider;
  message?: string;
  at: string;
};

const LINK_RESULT_SESSION_KEY = 'p3_identity_link_result';
const LINK_INTENT = 'manual_identity_link';
const PROFILE_DESTINATION = '/dashboard?view=profile';

const normalizeProvider = (value: unknown): string =>
  String(value || '')
    .trim()
    .toLowerCase();

const isOAuthLinkProvider = (value: unknown): value is OAuthLinkProvider =>
  normalizeProvider(value) === 'google' || normalizeProvider(value) === 'apple';

const parseStoredResult = (raw: string): IdentityLinkResult | null => {
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    const provider = normalizeProvider(parsed?.provider);
    const status = normalizeProvider(parsed?.status);
    if (!isOAuthLinkProvider(provider)) return null;
    if (status !== 'success' && status !== 'error') return null;

    return {
      provider,
      status: status as IdentityLinkResult['status'],
      message: parsed?.message ? String(parsed.message) : undefined,
      at: String(parsed?.at || new Date().toISOString()),
    };
  } catch {
    return null;
  }
};

const buildLinkRedirectUrl = (provider: OAuthLinkProvider) => {
  const url = new URL('/auth/callback', window.location.origin);
  url.searchParams.set('intent', LINK_INTENT);
  url.searchParams.set('provider', provider);
  url.searchParams.set('next', PROFILE_DESTINATION);
  return url.toString();
};

const fromIdentityRows = (identities: Array<{ provider?: string | null }>) => {
  const providers = new Set<SupportedIdentityProvider>();

  for (const identity of identities) {
    const provider = normalizeProvider(identity?.provider);
    if (provider === 'email' || provider === 'google' || provider === 'apple') {
      providers.add(provider);
    }
  }

  return Array.from(providers);
};

export const IdentityLinkingService = {
  linkIntent: LINK_INTENT,

  async getLinkedProviders(): Promise<SupportedIdentityProvider[]> {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      throw error;
    }

    if (!user) return [];

    const providers = fromIdentityRows(Array.isArray(user.identities) ? user.identities : []);
    if (user.email) {
      providers.push('email');
    }

    return Array.from(new Set(providers));
  },

  async startManualLink(provider: OAuthLinkProvider) {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session?.user?.id) {
      throw new Error('Sign in before linking a provider.');
    }

    const linkIdentityFn = (supabase.auth as any)?.linkIdentity;
    if (typeof linkIdentityFn !== 'function') {
      throw new Error('Supabase identity linking is unavailable in this client build.');
    }

    const { data, error } = await linkIdentityFn({
      provider,
      options: {
        redirectTo: buildLinkRedirectUrl(provider),
      },
    });

    if (error) throw error;
    if (!data?.url) {
      throw new Error('Supabase did not return an identity-link redirect URL.');
    }

    window.location.assign(data.url);
  },

  persistResult(result: IdentityLinkResult) {
    try {
      window.sessionStorage.setItem(LINK_RESULT_SESSION_KEY, JSON.stringify(result));
    } catch {
      // Ignore storage failures (private mode / quota).
    }
  },

  consumeResult(): IdentityLinkResult | null {
    try {
      const raw = window.sessionStorage.getItem(LINK_RESULT_SESSION_KEY);
      if (!raw) return null;
      window.sessionStorage.removeItem(LINK_RESULT_SESSION_KEY);
      return parseStoredResult(raw);
    } catch {
      return null;
    }
  },

  providerLabel(provider: OAuthLinkProvider) {
    return provider === 'google' ? 'Google' : 'Apple';
  },

  parseOAuthProvider(value: unknown): OAuthLinkProvider | null {
    if (!isOAuthLinkProvider(value)) return null;
    return normalizeProvider(value) as OAuthLinkProvider;
  },
};
