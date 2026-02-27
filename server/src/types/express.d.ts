import type { User } from '@supabase/supabase-js';

declare global {
  namespace Express {
    interface Request {
      accessToken?: string;
      auth?: {
        userId: string;
        email: string | null;
        roles: string[];
        rawUser?: User;
      };
      apiKey?: {
        id: string;
        orgId: string;
        keyPrefix: string;
        scopes: string[];
        env: 'test' | 'live';
        plan: 'sandbox' | 'paid';
        planStatus: 'active' | 'past_due' | 'canceled';
        rpmLimit: number;
        rpdLimit: number;
        monthlyLimit: number;
        currentPeriodStart?: string | null;
        currentPeriodEnd?: string | null;
      };
    }
  }
}

export {};
