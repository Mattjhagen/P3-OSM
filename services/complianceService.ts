import { frontendEnv } from './env';
import { RuntimeConfigService } from './runtimeConfigService';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');
const normalizeBackendBaseUrl = (value: string) => trimTrailingSlash(value).replace(/\/api$/i, '');

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
    return 'Compliance backend is unavailable right now (Render may be down).';
  }
  return message || 'Unable to reach compliance backend.';
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

const triggerDownload = (filename: string, payload: unknown) => {
  const content = JSON.stringify(payload, null, 2);
  const blob = new Blob([content], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export type ComplianceFeatureKey = 'ADD_FUNDS' | 'TRADE_CRYPTO' | 'WITHDRAW_FUNDS';

export interface FeatureAccessStatusDto {
  userId: string;
  featureKey: ComplianceFeatureKey;
  tosVersion: string;
  status: 'approved' | 'manual_review' | 'denied' | 'revoked' | 'pending' | 'not_applied';
  approved: boolean;
  requiresReacceptance: boolean;
  acceptedAt: string | null;
  lastRiskEvaluatedAt: string | null;
  riskTier: number | null;
  riskScore: number | null;
  riskReasons: string[];
  manualReviewTicketId: string | null;
  title: string;
  summary: string;
}

export interface FeatureApplicationDto extends FeatureAccessStatusDto {
  decision: 'approved' | 'manual_review' | 'denied';
}

export interface StatementSummaryDto {
  id: string;
  userId: string;
  statementType: 'MONTHLY' | 'YEARLY_TAX';
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  openingBalanceUsd: number;
  closingBalanceUsd: number;
  currency: string;
  signatureHash: string;
  signatureAlgorithm: string;
}

export interface DisclosureSummaryDto {
  id: string;
  userId: string;
  featureKey: ComplianceFeatureKey;
  disclosureKey: string;
  tosVersion: string;
  accepted: boolean;
  acceptedAt: string;
  decision: 'approved' | 'manual_review' | 'denied';
  riskTier: number | null;
  riskReasons: string[];
  manualReviewTicketId: string | null;
  signatureHash: string;
  signatureAlgorithm: string;
  createdAt: string;
}

export const ComplianceService = {
  getFeatureStatus: async (payload: {
    userId: string;
    featureKey: ComplianceFeatureKey;
  }): Promise<FeatureAccessStatusDto> => {
    const params = new URLSearchParams({
      userId: payload.userId,
      feature: payload.featureKey,
    });

    let response: Response;
    try {
      response = await fetch(`${getBackendBaseUrl()}/api/compliance/features/status?${params.toString()}`);
    } catch (error) {
      throw new Error(normalizeFetchError(error));
    }

    return (await parseApiResponse(response)) as FeatureAccessStatusDto;
  },

  applyForFeature: async (payload: {
    userId: string;
    featureKey: ComplianceFeatureKey;
    accepted: boolean;
    walletAddress?: string;
    attestationSignature?: string;
    source?: string;
  }): Promise<FeatureApplicationDto> => {
    let response: Response;
    try {
      response = await fetch(`${getBackendBaseUrl()}/api/compliance/features/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: payload.userId,
          feature: payload.featureKey,
          accepted: payload.accepted,
          walletAddress: payload.walletAddress || '',
          attestationSignature: payload.attestationSignature || '',
          source: payload.source || 'frontend_ui',
        }),
      });
    } catch (error) {
      throw new Error(normalizeFetchError(error));
    }

    return (await parseApiResponse(response)) as FeatureApplicationDto;
  },

  listStatements: async (payload: {
    userId: string;
    statementType?: 'MONTHLY' | 'YEARLY_TAX';
    limit?: number;
  }): Promise<StatementSummaryDto[]> => {
    const params = new URLSearchParams({ userId: payload.userId });
    if (payload.statementType) params.set('type', payload.statementType);
    if (Number.isFinite(Number(payload.limit))) params.set('limit', String(payload.limit));

    let response: Response;
    try {
      response = await fetch(`${getBackendBaseUrl()}/api/compliance/statements?${params.toString()}`);
    } catch (error) {
      throw new Error(normalizeFetchError(error));
    }

    return (await parseApiResponse(response)) as StatementSummaryDto[];
  },

  downloadStatement: async (payload: {
    statementId: string;
    userId: string;
  }) => {
    const params = new URLSearchParams({ userId: payload.userId });

    let response: Response;
    try {
      response = await fetch(
        `${getBackendBaseUrl()}/api/compliance/statements/${encodeURIComponent(payload.statementId)}/download?${params.toString()}`
      );
    } catch (error) {
      throw new Error(normalizeFetchError(error));
    }

    const statementData = await parseApiResponse(response);
    const statementType = String(statementData?.statementType || 'statement').toLowerCase();
    const periodStart = String(statementData?.periodStart || 'period');
    triggerDownload(`p3-${statementType}-${periodStart}.json`, statementData);
  },

  listSignedDisclosures: async (payload: {
    userId: string;
    featureKey?: ComplianceFeatureKey;
    limit?: number;
  }): Promise<DisclosureSummaryDto[]> => {
    const params = new URLSearchParams({ userId: payload.userId });
    if (payload.featureKey) params.set('feature', payload.featureKey);
    if (Number.isFinite(Number(payload.limit))) params.set('limit', String(payload.limit));

    let response: Response;
    try {
      response = await fetch(`${getBackendBaseUrl()}/api/compliance/disclosures?${params.toString()}`);
    } catch (error) {
      throw new Error(normalizeFetchError(error));
    }

    return (await parseApiResponse(response)) as DisclosureSummaryDto[];
  },

  downloadSignedDisclosure: async (payload: {
    disclosureId: string;
    userId: string;
  }) => {
    const params = new URLSearchParams({ userId: payload.userId });

    let response: Response;
    try {
      response = await fetch(
        `${getBackendBaseUrl()}/api/compliance/disclosures/${encodeURIComponent(payload.disclosureId)}/download?${params.toString()}`
      );
    } catch (error) {
      throw new Error(normalizeFetchError(error));
    }

    const disclosureData = await parseApiResponse(response);
    const featureKey = String(disclosureData?.featureKey || 'feature').toLowerCase();
    const disclosureId = String(disclosureData?.id || 'disclosure');
    triggerDownload(`p3-disclosure-${featureKey}-${disclosureId}.json`, disclosureData);
  },
};
