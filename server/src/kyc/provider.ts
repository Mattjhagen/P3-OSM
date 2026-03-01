/**
 * Pluggable KYC provider interface.
 * Implementations: demo (simulated), openkyc (FaceOnLive), future: stripe_identity, persona, etc.
 */

export interface KycStartContext {
  userId?: string | null;
}

export interface KycStartResult {
  sessionId: string;
  url: string;
}

export interface KycStatusResult {
  status: 'created' | 'pending' | 'approved' | 'rejected' | 'error';
  extracted?: Record<string, unknown> | null;
}

export interface KycProvider {
  startSession(ctx: KycStartContext): Promise<KycStartResult>;
  getStatus(providerSessionId: string): Promise<KycStatusResult>;
}
