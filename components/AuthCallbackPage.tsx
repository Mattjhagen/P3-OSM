import React, { useEffect, useState } from 'react';
import { Logo } from './Logo';
import { Button } from './Button';
import { supabase } from '../supabaseClient';

const normalizePath = (value: string) => value.replace(/\/+$/, '') || '/';

const isOnboardingComplete = (data: Record<string, unknown>) => {
  if (data.onboarding_completed === true || data.onboardingCompleted === true) return true;
  const kycStatus = String(data.kycStatus || '').toUpperCase();
  if (kycStatus === 'VERIFIED') return true;
  return false;
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

        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
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

        await supabase.from('users').upsert({
          id: userId,
          email: userEmail,
          data: {
            ...currentData,
            onboarding_started: true,
            last_auth_at: new Date().toISOString(),
          },
        });

        const destination = next
          ? normalizePath(next)
          : completed
            ? '/dashboard'
            : '/onboarding';

        window.location.replace(destination);
      } catch (authError: any) {
        if (!active) return;
        setError(String(authError?.message || 'Sign-in failed or was cancelled.'));
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

