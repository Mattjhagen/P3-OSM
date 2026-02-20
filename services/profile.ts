import type { UserProfile } from '../types';
import { PersistenceService } from './persistence';

const PROFILE_LOAD_TIMEOUT_MS = 10_000;

export const isDev = (): boolean =>
  typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV === true;

export interface EnsureProfileResult {
  profile: UserProfile | null;
  error: string | null;
  status?: number;
  code?: string;
}

/**
 * Load or create user profile with timeout and safe error handling.
 * Always resolves (never hangs). Use for post-login profile load.
 */
export async function ensureProfile(
  authUser: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null,
  pendingReferralCode?: string | null
): Promise<EnsureProfileResult> {
  // #region agent log
  if (isDev()) {
    fetch('http://127.0.0.1:7252/ingest/d088b2d2-368a-4d15-b2a6-9f2121d6b427', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f7fb16' },
      body: JSON.stringify({
        sessionId: 'f7fb16',
        location: 'profile.ts:ensureProfile:start',
        message: 'Profile load start',
        data: { userId: authUser?.id ?? null },
        timestamp: Date.now(),
        hypothesisId: 'H3',
      }),
    }).catch(() => {});
  }
  // #endregion

  if (!authUser) {
    if (isDev()) console.warn('[profile] ensureProfile: no auth user');
    return { profile: null, error: 'Not signed in', status: 401 };
  }

  const timeoutPromise = new Promise<EnsureProfileResult>((_, reject) => {
    setTimeout(() => reject(new Error('PROFILE_LOAD_TIMEOUT')), PROFILE_LOAD_TIMEOUT_MS);
  });

  const loadPromise = (async (): Promise<EnsureProfileResult> => {
    try {
      const profile = await PersistenceService.loadUser(authUser, pendingReferralCode);
      // #region agent log
      if (isDev()) {
        fetch('http://127.0.0.1:7252/ingest/d088b2d2-368a-4d15-b2a6-9f2121d6b427', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f7fb16' },
          body: JSON.stringify({
            sessionId: 'f7fb16',
            location: 'profile.ts:ensureProfile:success',
            message: 'Profile load success',
            data: { profileId: profile?.id },
            timestamp: Date.now(),
            hypothesisId: 'H3',
          }),
        }).catch(() => {});
      }
      // #endregion
      if (isDev()) console.log('[profile] ensureProfile: success', profile?.id);
      return { profile, error: null };
    } catch (e: any) {
      const message = e?.message ?? String(e);
      const code = e?.code ?? (e?.status ? String(e.status) : undefined);
      const status = e?.status ?? (e?.statusCode ?? undefined);
      // #region agent log
      if (isDev()) {
        fetch('http://127.0.0.1:7252/ingest/d088b2d2-368a-4d15-b2a6-9f2121d6b427', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f7fb16' },
          body: JSON.stringify({
            sessionId: 'f7fb16',
            location: 'profile.ts:ensureProfile:failure',
            message: 'Profile load failure',
            data: { message, code, status },
            timestamp: Date.now(),
            hypothesisId: 'H3',
          }),
        }).catch(() => {});
      }
      // #endregion
      if (isDev()) console.warn('[profile] ensureProfile: failure', message, code, status);
      return {
        profile: null,
        error: message,
        status: typeof status === 'number' ? status : undefined,
        code: typeof code === 'string' ? code : undefined,
      };
    }
  })();

  try {
    const result = await Promise.race([loadPromise, timeoutPromise]);
    return result;
  } catch (e: any) {
    if (e?.message === 'PROFILE_LOAD_TIMEOUT') {
      if (isDev()) console.warn('[profile] ensureProfile: timeout after', PROFILE_LOAD_TIMEOUT_MS, 'ms');
      return {
        profile: null,
        error: 'Profile load timed out. Please check your connection and try again.',
        code: 'TIMEOUT',
      };
    }
    const message = e?.message ?? String(e);
    if (isDev()) console.warn('[profile] ensureProfile: race error', message);
    return { profile: null, error: message };
  }
}

export function isProfileAccessDeniedError(result: EnsureProfileResult): boolean {
  const s = result.status;
  const code = (result.code ?? '').toLowerCase();
  const msg = (result.error ?? '').toLowerCase();
  return s === 401 || s === 403 || code === '401' || code === '403' || msg.includes('denied') || msg.includes('permission') || msg.includes('rls');
}
