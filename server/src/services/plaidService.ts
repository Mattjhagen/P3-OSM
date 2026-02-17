import { config } from '../config/config';

const PLAID_BASE_URL_BY_ENV: Record<string, string> = {
  sandbox: 'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production: 'https://production.plaid.com',
};

interface PlaidRequestOptions {
  endpoint: string;
  body: Record<string, unknown>;
}

interface PlaidAccount {
  account_id: string;
  mask: string | null;
  name: string;
  subtype: string;
  type: string;
}

const plaidApiRequest = async <T>(options: PlaidRequestOptions): Promise<T> => {
  if (!PlaidService.isConfigured()) {
    throw new Error('Plaid is not configured. Set PLAID_CLIENT_ID and PLAID_SECRET.');
  }

  const baseUrl = PLAID_BASE_URL_BY_ENV[config.plaid.env] || PLAID_BASE_URL_BY_ENV.sandbox;
  const response = await fetch(`${baseUrl}${options.endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: config.plaid.clientId,
      secret: config.plaid.secret,
      ...options.body,
    }),
  });

  const body: any = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = body?.error_message || body?.display_message || body?.error_code || `HTTP ${response.status}`;
    throw new Error(`Plaid API request failed: ${detail}`);
  }

  return body as T;
};

const normalizePlaidProducts = () => {
  if (!Array.isArray(config.plaid.products) || config.plaid.products.length === 0) {
    return ['auth', 'identity'];
  }

  return config.plaid.products;
};

export const PlaidService = {
  isConfigured: () => Boolean(config.plaid.clientId && config.plaid.secret),

  async createLinkToken(payload: { userId: string; email?: string }) {
    type LinkTokenResponse = {
      link_token: string;
      expiration: string;
      request_id: string;
    };

    return plaidApiRequest<LinkTokenResponse>({
      endpoint: '/link/token/create',
      body: {
        client_name: 'P3 Lending Protocol',
        language: 'en',
        country_codes: config.plaid.countryCodes.length ? config.plaid.countryCodes : ['US'],
        products: normalizePlaidProducts(),
        user: {
          client_user_id: payload.userId,
          email_address: payload.email || undefined,
        },
        webhook: config.plaid.webhookUrl || undefined,
        redirect_uri: config.plaid.redirectUri || undefined,
      },
    });
  },

  async exchangePublicToken(publicToken: string) {
    type ExchangeResponse = {
      access_token: string;
      item_id: string;
      request_id: string;
    };

    return plaidApiRequest<ExchangeResponse>({
      endpoint: '/item/public_token/exchange',
      body: {
        public_token: publicToken,
      },
    });
  },

  async getAccounts(accessToken: string) {
    type AccountsResponse = {
      accounts: PlaidAccount[];
      item: {
        institution_id: string | null;
      };
      request_id: string;
    };

    return plaidApiRequest<AccountsResponse>({
      endpoint: '/accounts/get',
      body: {
        access_token: accessToken,
      },
    });
  },

  async getInstitutionName(institutionId: string | null): Promise<string> {
    if (!institutionId) return 'Unknown Institution';

    type InstitutionResponse = {
      institution: {
        name: string;
      };
      request_id: string;
    };

    const response = await plaidApiRequest<InstitutionResponse>({
      endpoint: '/institutions/get_by_id',
      body: {
        institution_id: institutionId,
        country_codes: config.plaid.countryCodes.length ? config.plaid.countryCodes : ['US'],
      },
    });

    return response.institution?.name || 'Unknown Institution';
  },

  async createStripeProcessorToken(accessToken: string, accountId: string) {
    type ProcessorTokenResponse = {
      processor_token: string;
      request_id: string;
    };

    return plaidApiRequest<ProcessorTokenResponse>({
      endpoint: '/processor/stripe/bank_account_token/create',
      body: {
        access_token: accessToken,
        account_id: accountId,
      },
    });
  },

  async identityCheck(accessToken: string) {
    type IdentityResponse = {
      accounts: Array<{
        account_id: string;
        owners: Array<{
          names?: string[];
          emails?: Array<{ data: string }>;
          phone_numbers?: Array<{ data: string }>;
          addresses?: Array<{ data: { street: string; city: string; region: string; postal_code: string; country: string } }>;
        }>;
      }>;
      request_id: string;
    };

    return plaidApiRequest<IdentityResponse>({
      endpoint: '/identity/get',
      body: {
        access_token: accessToken,
      },
    });
  },
};
