import { frontendEnv } from './env';
import { RuntimeConfigService } from './runtimeConfigService';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const getBackendBaseUrl = () =>
  trimTrailingSlash(
    RuntimeConfigService.getEffectiveValue('BACKEND_URL', frontendEnv.VITE_BACKEND_URL)
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
};
