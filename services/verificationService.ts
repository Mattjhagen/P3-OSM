import { frontendEnv } from './env';
import { RuntimeConfigService } from './runtimeConfigService';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');
const normalizeBackendBaseUrl = (value: string) =>
  trimTrailingSlash(value).replace(/\/api$/i, '');

const getBackendBaseUrl = () =>
  normalizeBackendBaseUrl(
    RuntimeConfigService.getEffectiveValue('BACKEND_URL', frontendEnv.VITE_BACKEND_URL)
  );

const normalizeFetchError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '');
  const lower = message.toLowerCase();
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('load failed')
  ) {
    return 'Verification backend is unavailable right now (Render may be down).';
  }
  return message || 'Unable to reach verification backend.';
};

const parseApiResponse = async (response: Response) => {
  let body: any = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok || !body?.success) {
    throw new Error(body?.error || `Request failed (${response.status})`);
  }

  return body.data;
};

export interface StripeKycSessionDto {
  sessionId: string;
  clientSecret?: string | null;
  url?: string | null;
  status: string;
  requestedTier: number;
  returnUrl: string;
}

export interface StripeKycSessionStatusDto {
  sessionId: string;
  userId: string;
  status: string;
  requestedTier: number;
  requiresManualReview: boolean;
  amlRiskScore: number | null;
  amlNotes: string | null;
  lastErrorCode: string | null;
  lastErrorReason: string | null;
  verifiedAt: string | null;
  verificationUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export const VerificationServiceClient = {
  createStripeIdentitySession: async (payload: {
    userId: string;
    userEmail?: string;
    userPhone?: string;
    requestedTier?: number;
    returnUrl?: string;
    firstName?: string;
    lastName?: string;
    dob?: string;
    address?: string;
    phone?: string;
    email?: string;
    ssnLast4?: string;
    annualSalaryUsd?: number;
  }) => {
    let response: Response;
    try {
      response = await fetch(`${getBackendBaseUrl()}/api/verification/stripe/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      throw new Error(normalizeFetchError(error));
    }

    return (await parseApiResponse(response)) as StripeKycSessionDto;
  },

  getStripeIdentitySessionStatus: async (payload: {
    userId: string;
    sessionId: string;
    refresh?: boolean;
  }) => {
    const params = new URLSearchParams({
      userId: payload.userId,
      refresh: payload.refresh ? 'true' : 'false',
    });

    let response: Response;
    try {
      response = await fetch(
        `${getBackendBaseUrl()}/api/verification/stripe/session/${encodeURIComponent(
          payload.sessionId
        )}?${params.toString()}`,
        {
          method: 'GET',
        }
      );
    } catch (error) {
      throw new Error(normalizeFetchError(error));
    }

    return (await parseApiResponse(response)) as StripeKycSessionStatusDto;
  },

  listStripeIdentitySessions: async (payload: {
    userId: string;
    limit?: number;
  }): Promise<StripeKycSessionStatusDto[]> => {
    const params = new URLSearchParams({
      userId: payload.userId,
      limit: String(payload.limit || 10),
    });

    let response: Response;
    try {
      response = await fetch(
        `${getBackendBaseUrl()}/api/verification/stripe/sessions?${params.toString()}`,
        {
          method: 'GET',
        }
      );
    } catch (error) {
      throw new Error(normalizeFetchError(error));
    }

    return (await parseApiResponse(response)) as StripeKycSessionStatusDto[];
  },
};

