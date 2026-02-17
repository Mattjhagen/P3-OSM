import { frontendEnv } from './env';
import { RuntimeConfigService } from './runtimeConfigService';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');
const normalizeBackendBaseUrl = (value: string) =>
  trimTrailingSlash(value).replace(/\/api$/i, '');
const DEFAULT_STRIPE_DONATE_URL = 'https://buy.stripe.com/14A6oH5Nb72t38K1VEaIM00';

const getBackendBaseUrl = () =>
  normalizeBackendBaseUrl(
    RuntimeConfigService.getEffectiveValue('BACKEND_URL', frontendEnv.VITE_BACKEND_URL)
  );
const getHostedDonationUrl = () =>
  RuntimeConfigService.getEffectiveValue(
    'STRIPE_DONATE_URL',
    frontendEnv.VITE_STRIPE_DONATE_URL || DEFAULT_STRIPE_DONATE_URL
  );

export interface DonationCheckoutPayload {
  amountUsd: number;
  donorEmail?: string;
  donorName?: string;
  source?: string;
}

export interface DepositCheckoutPayload {
  amountUsd: number;
  userId: string;
  userEmail?: string;
}

export interface DonationCheckoutResult {
  checkoutUrl: string;
  sessionId: string;
}

export interface DepositCheckoutResult {
  checkoutUrl: string;
  sessionId: string;
}

export interface ServiceCatalogItem {
  serviceType: string;
  displayName: string;
  description: string;
  defaultAmountUsd: number;
  minAmountUsd: number;
  maxAmountUsd: number;
  taxCode?: string | null;
}

export interface ServiceCheckoutPayload {
  serviceType: string;
  amountUsd?: number;
  userId?: string;
  userEmail?: string;
  source?: string;
}

export interface ServiceCheckoutResult {
  checkoutUrl: string;
  sessionId: string;
  serviceType: string;
  baseAmountUsd: number;
  serviceFeeUsd: number;
  subtotalUsd: number;
}

export interface ServiceTaxQuotePayload {
  serviceType: string;
  amountUsd?: number;
  customerAddress: {
    country: string;
    postalCode?: string;
    state?: string;
    city?: string;
    line1?: string;
    line2?: string;
  };
}

export interface ServiceTaxQuoteResult {
  calculationId: string;
  serviceType: string;
  displayName: string;
  currency: string;
  baseAmountUsd: number;
  serviceFeeUsd: number;
  subtotalUsd: number;
  taxUsd: number;
  totalUsd: number;
  feePolicy: {
    percent: number;
    fixedUsd: number;
    feeTaxable: boolean;
  };
}

interface DonationCheckoutApiResponse {
  success: boolean;
  data?: DonationCheckoutResult;
  error?: string;
}

interface DepositCheckoutApiResponse {
  success: boolean;
  data?: DepositCheckoutResult;
  url?: string;
  error?: string;
}

interface ServiceCatalogApiResponse {
  success: boolean;
  data?: {
    services: ServiceCatalogItem[];
    stripeTaxEnabled: boolean;
    serviceFeePolicy: {
      percent: number;
      fixedUsd: number;
      feeTaxable: boolean;
    };
  };
  error?: string;
}

interface ServiceCheckoutApiResponse {
  success: boolean;
  data?: ServiceCheckoutResult;
  error?: string;
}

interface ServiceTaxQuoteApiResponse {
  success: boolean;
  data?: ServiceTaxQuoteResult;
  error?: string;
}

const normalizeFetchError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '');
  const lower = message.toLowerCase();
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('load failed')
  ) {
    return 'Payments backend is unavailable right now (Render may be down). Please try again shortly.';
  }
  return message || 'Unable to reach payments backend.';
};

export const PaymentService = {
  createDonationCheckoutSession: async (
    payload: DonationCheckoutPayload
  ): Promise<DonationCheckoutResult> => {
    let response: Response;
    try {
      response = await fetch(
        `${getBackendBaseUrl()}/api/payments/donations/create-checkout-session`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );
    } catch (error) {
      const hostedDonationUrl = getHostedDonationUrl();
      if (hostedDonationUrl) {
        return {
          checkoutUrl: hostedDonationUrl,
          sessionId: 'hosted_link',
        };
      }
      throw new Error(normalizeFetchError(error));
    }

    let responseBody: DonationCheckoutApiResponse | null = null;
    try {
      responseBody = (await response.json()) as DonationCheckoutApiResponse;
    } catch {
      responseBody = null;
    }

    if (!response.ok || !responseBody?.success || !responseBody.data?.checkoutUrl) {
      throw new Error(
        responseBody?.error || 'Failed to create donation checkout session.'
      );
    }

    return responseBody.data;
  },

  createDepositCheckoutSession: async (
    payload: DepositCheckoutPayload
  ): Promise<DepositCheckoutResult> => {
    let response: Response;
    try {
      response = await fetch(`${getBackendBaseUrl()}/api/payments/deposit/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: payload.amountUsd,
          userId: payload.userId,
          userEmail: payload.userEmail || '',
        }),
      });
    } catch (error) {
      throw new Error(normalizeFetchError(error));
    }

    let responseBody: DepositCheckoutApiResponse | null = null;
    try {
      responseBody = (await response.json()) as DepositCheckoutApiResponse;
    } catch {
      responseBody = null;
    }

    const checkoutUrl =
      responseBody?.data?.checkoutUrl || responseBody?.url || '';
    if (!response.ok || !responseBody?.success || !checkoutUrl) {
      throw new Error(
        responseBody?.error || 'Failed to create deposit checkout session.'
      );
    }

    return {
      checkoutUrl,
      sessionId: responseBody?.data?.sessionId || '',
    };
  },

  getServiceCatalog: async () => {
    let response: Response;
    try {
      response = await fetch(`${getBackendBaseUrl()}/api/payments/services/catalog`, {
        method: 'GET',
      });
    } catch (error) {
      throw new Error(normalizeFetchError(error));
    }

    let responseBody: ServiceCatalogApiResponse | null = null;
    try {
      responseBody = (await response.json()) as ServiceCatalogApiResponse;
    } catch {
      responseBody = null;
    }

    if (!response.ok || !responseBody?.success || !responseBody.data) {
      throw new Error(responseBody?.error || 'Failed to load service catalog.');
    }

    return responseBody.data;
  },

  createServiceTaxQuote: async (
    payload: ServiceTaxQuotePayload
  ): Promise<ServiceTaxQuoteResult> => {
    let response: Response;
    try {
      response = await fetch(`${getBackendBaseUrl()}/api/payments/services/tax-quote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      throw new Error(normalizeFetchError(error));
    }

    let responseBody: ServiceTaxQuoteApiResponse | null = null;
    try {
      responseBody = (await response.json()) as ServiceTaxQuoteApiResponse;
    } catch {
      responseBody = null;
    }

    if (!response.ok || !responseBody?.success || !responseBody.data) {
      throw new Error(responseBody?.error || 'Failed to generate service tax quote.');
    }

    return responseBody.data;
  },

  createServiceCheckoutSession: async (
    payload: ServiceCheckoutPayload
  ): Promise<ServiceCheckoutResult> => {
    let response: Response;
    try {
      response = await fetch(`${getBackendBaseUrl()}/api/payments/services/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      throw new Error(normalizeFetchError(error));
    }

    let responseBody: ServiceCheckoutApiResponse | null = null;
    try {
      responseBody = (await response.json()) as ServiceCheckoutApiResponse;
    } catch {
      responseBody = null;
    }

    if (!response.ok || !responseBody?.success || !responseBody.data?.checkoutUrl) {
      throw new Error(responseBody?.error || 'Failed to create service checkout session.');
    }

    return responseBody.data;
  },
};
