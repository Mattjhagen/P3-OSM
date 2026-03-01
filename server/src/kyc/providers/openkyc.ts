/**
 * OpenKYC / IDKit provider (FaceOnLive).
 * Calls OPENKYC_BASE_URL - works with real OpenKYC or mock.
 */

import { KycProvider, KycStartContext, KycStartResult, KycStatusResult } from '../provider';
import { config } from '../../config/config';

const baseUrl = config.kyc.openkycBaseUrl;

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    throw new Error(`OpenKYC ${path}: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const openkycProvider: KycProvider = {
  async startSession(_ctx: KycStartContext): Promise<KycStartResult> {
    const body = await fetchJson<{ sessionId: string; url: string }>('/sessions', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    return { sessionId: body.sessionId, url: body.url };
  },

  async getStatus(providerSessionId: string): Promise<KycStatusResult> {
    const body = await fetchJson<{ status: string; extractedFields?: Record<string, unknown> }>(
      `/sessions/${encodeURIComponent(providerSessionId)}`
    );
    const status = (body.status || 'pending') as KycStatusResult['status'];
    const extracted = body.extractedFields ?? null;
    return { status, extracted };
  },
};
