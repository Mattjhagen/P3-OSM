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

async function parseJsonOrThrow(res: Response, url: string) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    if (text.trimStart().startsWith('<')) {
      throw new Error(
        `Backend returned HTML instead of JSON. Is the backend running at ${url}? Check VITE_BACKEND_URL in .env`
      );
    }
    throw new Error(text || `Request failed (${res.status})`);
  }
}

export async function startKycSession(): Promise<KycStartResponse> {
  const base = getBackendBaseUrl();
  const res = await fetch(`${base}/api/kyc/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const data = await parseJsonOrThrow(res, base);
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return { sessionId: data.sessionId, verificationUrl: data.verificationUrl };
}

export async function getKycStatus(sessionId: string): Promise<KycStatusResponse> {
  const base = getBackendBaseUrl();
  const res = await fetch(`${base}/api/kyc/status/${encodeURIComponent(sessionId)}`);
  const data = await parseJsonOrThrow(res, base);
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return { status: data.status, extracted: data.extracted };
}
