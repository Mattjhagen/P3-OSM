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

export interface DonationCheckoutResult {
  checkoutUrl: string;
  sessionId: string;
}

interface DonationCheckoutApiResponse {
  success: boolean;
  data?: DonationCheckoutResult;
  error?: string;
}

export const PaymentService = {
  createDonationCheckoutSession: async (
    payload: DonationCheckoutPayload
  ): Promise<DonationCheckoutResult> => {
    const response = await fetch(
      `${getBackendBaseUrl()}/api/payments/donations/create-checkout-session`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

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
};
