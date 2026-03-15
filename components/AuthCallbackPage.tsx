import React, { useEffect, useState } from 'react';
import { Logo } from './Logo';
import { Button } from './Button';
import { supabase } from '../supabaseClient';
import { IdentityLinkingService } from '../services/identityLinkingService';

const normalizePath = (value: string) => value.replace(/\/+$/, '') || '/';

/** Allow only same-origin paths to prevent open redirect. Rejects protocol-relative, absolute URLs, and paths with "//" or ":". */
const isSafeRedirectPath = (value: string | null): value is string => {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed === '') return false;
  if (!trimmed.startsWith('/')) return false;
  if (trimmed.includes('//') || trimmed.includes(':')) return false;
  return true;
};

const isOnboardingComplete = (data: Record<string, unknown>) => {
  if (data.onboarding_completed === true || data.onboardingCompleted === true) return true;
  const kycStatus = String(data.kycStatus || '').toUpperCase();
  if (kycStatus === 'VERIFIED') return true;
  return false;
};

const toFriendlyAuthError = (error: unknown) => {
  const message = String((error as any)?.message || 'Sign-in failed or was cancelled.');
  if (
    message.includes('email_already_bound_to_verified_account') ||
    message.includes('verified_account_requires_unique_email')
  ) {
    return 'This identity is already tied to a KYC-verified account. Sign in using a linked method from your original account.';
  }
  return message;
};

export const resolveAuthDestination = (options: {
  next: string | null;
  onboardingCompleted: boolean;
}) => {
  if (options.next && isSafeRedirectPath(options.next)) {
    return normalizePath(options.next);
  }
  return options.onboardingCompleted ? '/dashboard' : '/onboarding';
};

export const AuthCallbackPage: React.FC = () => {
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const finishAuth = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const next = params.get('next');
        const code = params.get('code');
        const intent = String(params.get('intent') || '').trim();
        const linkedProvider = IdentityLinkingService.parseOAuthProvider(params.get('provider'));
        const isManualLinkFlow =
          intent === IdentityLinkingService.linkIntent && Boolean(linkedProvider);
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        } else if (accessToken && refreshToken) {
          // Fallback for implicit/hash redirects so legacy provider flows still complete.
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        }

        // Remove sensitive params/tokens from URL as soon as callback is processed.
        if (window.location.search || window.location.hash) {
          window.history.replaceState({}, document.title, '/auth/callback');
        }

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;
        if (!session?.user?.id) {
          throw new Error('Sign-in failed or was cancelled.');
        }

        const userId = String(session.user.id);
        const userEmail = String(session.user.email || '').trim().toLowerCase();
        const { data: existingRow } = await supabase
          .from('users')
          .select('id,data,email')
          .eq('id', userId)
          .maybeSingle();

        const currentData =
          existingRow?.data && typeof existingRow.data === 'object'
            ? { ...(existingRow.data as Record<string, unknown>) }
            : {};

        const completed = isOnboardingComplete(currentData);

        const { error: upsertError } = await supabase.from('users').upsert({
          id: userId,
          email: userEmail,
          data: {
            ...currentData,
            onboarding_started: true,
            last_auth_at: new Date().toISOString(),
          },
        });
        if (upsertError) throw upsertError;

        const destination = resolveAuthDestination({
          next,
          onboardingCompleted: completed,
        });

        if (isManualLinkFlow && linkedProvider) {
          IdentityLinkingService.persistResult({
            status: 'success',
            provider: linkedProvider,
            message: `${IdentityLinkingService.providerLabel(linkedProvider)} sign-in linked successfully.`,
            at: new Date().toISOString(),
          });
        }

        window.location.replace(destination);
      } catch (authError: any) {
        console.error('[auth/callback] finalize_failed', authError);
        if (!active) return;

        if (isManualLinkFlow && linkedProvider) {
          IdentityLinkingService.persistResult({
            status: 'error',
            provider: linkedProvider,
            message: String(authError?.message || 'Unable to link this sign-in method.'),
            at: new Date().toISOString(),
          });
          window.location.replace('/dashboard?view=profile');
          return;
        }
        setError(toFriendlyAuthError(authError));
      }
    };

    finishAuth();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-[100dvh] bg-[#050505] text-zinc-200 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#0a0a0a] p-6 space-y-5 text-center">
        <div className="flex items-center justify-center">
          <Logo />
        </div>
        {!error ? (
          <p className="text-sm text-zinc-400">Completing sign-in...</p>
        ) : (
          <>
            <p className="text-sm text-red-400">{error}</p>
            <div className="flex flex-col gap-2">
              <Button onClick={() => window.location.assign('/login')} className="w-full">
                Back to Login
              </Button>
              <button
                onClick={() => window.location.assign('/')}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                Back to Home
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

