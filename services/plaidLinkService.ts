import { TradingService } from './tradingService';

const PLAID_SCRIPT_URL = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';

/** Load Plaid script dynamically. Only needed when user links bank; avoids blocking initial page load. */
const ensurePlaidLoaded = (): Promise<void> => {
  if (typeof window === 'undefined' || (window as any).Plaid?.create) return Promise.resolve();
  const existing = document.querySelector(`script[src="${PLAID_SCRIPT_URL}"]`);
  if (existing) {
    return new Promise<void>((resolve) => {
      if ((window as any).Plaid?.create) return resolve();
      (existing as HTMLScriptElement).addEventListener('load', () => resolve());
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PLAID_SCRIPT_URL;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Plaid Link script.'));
    document.head.appendChild(script);
  });
};

interface PlaidOnSuccessMetadata {
  institution?: { institution_id: string | null; name: string } | null;
  accounts?: Array<{ id: string; name: string; mask: string; subtype: string; type: string }>;
  link_session_id?: string;
}

interface PlaidOnExitMetadata {
  institution?: { institution_id: string | null; name: string } | null;
  status?: string;
  request_id?: string;
  link_session_id?: string;
}

interface PlaidError {
  error_code?: string;
  error_message?: string;
  display_message?: string;
}

interface PlaidHandler {
  open(): void;
  exit(options?: { force: boolean }, callback?: () => void): void;
  destroy(): void;
}

interface PlaidFactory {
  create(config: {
    token: string;
    receivedRedirectUri?: string;
    onSuccess: (publicToken: string, metadata: PlaidOnSuccessMetadata) => void;
    onExit: (error: PlaidError | null, metadata: PlaidOnExitMetadata) => void;
  }): PlaidHandler;
}

declare global {
  interface Window {
    Plaid?: PlaidFactory;
  }
}

const LINK_TOKEN_STORAGE_KEY = 'p3_plaid_link_token';
const LINK_USER_STORAGE_KEY = 'p3_plaid_user_id';

const getRedirectUri = () => `${window.location.origin}/oauth.html`;

const getReceivedRedirectUri = () =>
  `${window.location.origin}${window.location.pathname}${window.location.search}`;

const hasOauthStateInQuery = () => window.location.search.includes('oauth_state_id=');

const clearStoredLinkState = () => {
  sessionStorage.removeItem(LINK_TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(LINK_USER_STORAGE_KEY);
};

const clearOAuthQueryParams = () => {
  const params = new URLSearchParams(window.location.search);
  const keys = [
    'oauth_state_id',
    'public_token',
    'error',
    'error_code',
    'error_message',
    'state',
  ];

  let changed = false;
  keys.forEach((key) => {
    if (params.has(key)) {
      params.delete(key);
      changed = true;
    }
  });

  if (!changed) return;

  const nextQuery = params.toString();
  const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
  window.history.replaceState({}, document.title, nextUrl);
};

const launchPlaidFlow = async (payload: {
  linkToken: string;
  userId: string;
  receivedRedirectUri?: string;
}) => {
  await ensurePlaidLoaded();
  if (!window.Plaid?.create) {
    throw new Error('Plaid Link script is not loaded.');
  }

  return new Promise<any>((resolve, reject) => {
    let settled = false;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const handler = window.Plaid!.create({
      token: payload.linkToken,
      receivedRedirectUri: payload.receivedRedirectUri,
      onSuccess: async (publicToken, metadata) => {
        try {
          const exchange = await TradingService.exchangePlaidPublicToken({
            userId: payload.userId,
            publicToken,
            accountId: metadata.accounts?.[0]?.id,
          });
          clearStoredLinkState();
          clearOAuthQueryParams();
          settle(() => resolve(exchange));
        } catch (error) {
          settle(() => reject(error));
        } finally {
          handler.destroy();
        }
      },
      onExit: (error, metadata) => {
        handler.destroy();
        if (error) {
          settle(() =>
            reject(
              new Error(
                error.display_message ||
                  error.error_message ||
                  error.error_code ||
                  'Plaid Link exited with an error.'
              )
            )
          );
          return;
        }

        settle(() =>
          reject(
            new Error(
              `Plaid Link exited before completion${metadata?.status ? ` (${metadata.status})` : ''}.`
            )
          )
        );
      },
    });

    handler.open();
  });
};

export const PlaidLinkService = {
  hasPendingOAuthRedirect: () => hasOauthStateInQuery(),

  async openLink(payload: { userId: string; email?: string }) {
    const linkToken = await TradingService.createPlaidLinkToken({
      userId: payload.userId,
      email: payload.email,
      redirectUri: getRedirectUri(),
    });

    if (!linkToken?.link_token) {
      throw new Error('Plaid link token was not returned by backend.');
    }

    sessionStorage.setItem(LINK_TOKEN_STORAGE_KEY, String(linkToken.link_token));
    sessionStorage.setItem(LINK_USER_STORAGE_KEY, payload.userId);

    return launchPlaidFlow({
      linkToken: String(linkToken.link_token),
      userId: payload.userId,
    });
  },

  async resumeOAuthRedirect(payload: { userId: string }) {
    if (!hasOauthStateInQuery()) return null;

    const storedUserId = sessionStorage.getItem(LINK_USER_STORAGE_KEY);
    const storedLinkToken = sessionStorage.getItem(LINK_TOKEN_STORAGE_KEY);

    if (!storedLinkToken) {
      clearOAuthQueryParams();
      throw new Error('Plaid OAuth redirect detected but no saved link token was found. Restart bank linking.');
    }

    if (storedUserId && storedUserId !== payload.userId) {
      clearStoredLinkState();
      clearOAuthQueryParams();
      throw new Error('Plaid OAuth redirect belongs to a different session. Restart bank linking.');
    }

    return launchPlaidFlow({
      linkToken: storedLinkToken,
      userId: payload.userId,
      receivedRedirectUri: getReceivedRedirectUri(),
    });
  },
};
