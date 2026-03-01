/**
 * Demo KYC provider - simulates success after 10 seconds.
 * Used when KYC_PROVIDER=demo or when OpenKYC is down.
 */

import { KycProvider, KycStartContext, KycStartResult, KycStatusResult } from '../provider';
import { config } from '../../config/config';

const DEMO_APPROVAL_MS = 10000;

const sessions = new Map<
  string,
  { createdAt: number; status: 'pending' | 'approved'; extracted: KycStatusResult['extracted'] }
>();

function randomId() {
  return 'demo_' + Math.random().toString(36).slice(2, 12);
}

export const demoProvider: KycProvider = {
  async startSession(_ctx: KycStartContext): Promise<KycStartResult> {
    const sessionId = randomId();
    const baseUrl = config.kyc.publicAppBaseUrl;
    const url = `${baseUrl}/kyc-mock-ui?sessionId=${sessionId}`;
    sessions.set(sessionId, {
      createdAt: Date.now(),
      status: 'pending',
      extracted: null,
    });
    return { sessionId, url };
  },

  async getStatus(providerSessionId: string): Promise<KycStatusResult> {
    const s = sessions.get(providerSessionId);
    if (!s) {
      return { status: 'error', extracted: null };
    }
    const elapsed = Date.now() - s.createdAt;
    if (s.status === 'pending' && elapsed >= DEMO_APPROVAL_MS) {
      s.status = 'approved';
      s.extracted = {
        firstName: 'Demo',
        lastName: 'Investor',
        dateOfBirth: '1990-01-15',
        documentType: 'passport',
        country: 'US',
      };
    }
    return {
      status: s.status,
      extracted: s.extracted,
    };
  },
};
