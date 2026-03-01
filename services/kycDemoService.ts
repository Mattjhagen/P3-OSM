import { frontendEnv } from './env';
import { RuntimeConfigService } from './runtimeConfigService';

const getBackendBaseUrl = () =>
  RuntimeConfigService.getEffectiveValue('BACKEND_URL', frontendEnv.VITE_BACKEND_URL).replace(/\/+$/, '');

export interface KycStartResponse {
  sessionId: string;
  verificationUrl: string;
}

export interface KycStatusResponse {
  status: 'created' | 'pending' | 'approved' | 'rejected' | 'error';
  extracted?: Record<string, unknown> | null;
}

export async function startKycSession(): Promise<KycStartResponse> {
  const res = await fetch(`${getBackendBaseUrl()}/api/kyc/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return { sessionId: data.sessionId, verificationUrl: data.verificationUrl };
}

export async function getKycStatus(sessionId: string): Promise<KycStatusResponse> {
  const res = await fetch(`${getBackendBaseUrl()}/api/kyc/status/${encodeURIComponent(sessionId)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return { status: data.status, extracted: data.extracted };
}
