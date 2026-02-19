import React, { useEffect, useMemo, useState } from 'react';
import { Logo } from './Logo';
import { Button } from './Button';
import { supabase } from '../supabaseClient';

type InviteMode = 'loading' | 'set_password' | 'invalid';

const normalizePath = (value: string) => value.replace(/\/+$/, '');

const toFriendlyInviteError = (error: unknown) => {
  const message = String((error as any)?.message || 'Unable to set password from invite link.');
  if (
    message.includes('email_already_bound_to_verified_account') ||
    message.includes('verified_account_requires_unique_email')
  ) {
    return 'This invite email is already associated with a KYC-verified account. Contact support to recover the original account.';
  }
  return message;
};

export const AuthInvitePage: React.FC = () => {
  const [mode, setMode] = useState<InviteMode>('loading');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const nextPath = params.get('next') || '/onboarding';
  const invitedEmail = String(params.get('email') || '').trim().toLowerCase();

  useEffect(() => {
    let active = true;

    const evaluateInviteState = async () => {
      setError('');
      try {
        // Supabase consumes invite hash tokens on load when detectSessionInUrl is enabled.
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();
        if (!sessionError && session?.user?.id) {
          if (!active) return;
          setMode('set_password');
          return;
        }
      } catch {
        // fall through to invalid state
      }

      if (!active) return;
      setMode('invalid');
    };
    evaluateInviteState();
    return () => {
      active = false;
    };
  }, []);

  const handleSetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = String(sessionData?.session?.user?.id || '').trim();
      const userEmail = String(sessionData?.session?.user?.email || invitedEmail || '').trim().toLowerCase();

      if (!userId) {
        setMode('invalid');
        setError('Invite session is missing or expired. Please request a new invite.');
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      const { data: existingProfile } = await supabase
        .from('users')
        .select('data')
        .eq('id', userId)
        .maybeSingle();

      const mergedProfileData =
        existingProfile?.data && typeof existingProfile.data === 'object'
          ? { ...existingProfile.data }
          : {};

      const { error: upsertError } = await supabase.from('users').upsert({
        id: userId,
        email: userEmail,
        data: {
          ...mergedProfileData,
          onboardingState: 'INVITE_ACCEPTED',
          onboarding_started: true,
          onboardingStartedAt: new Date().toISOString(),
        },
      });
      if (upsertError) throw upsertError;

      window.location.assign(nextPath);
    } catch (updateErr: any) {
      setError(toFriendlyInviteError(updateErr));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#050505] text-zinc-200 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#0a0a0a] p-6 space-y-5">
        <div className="flex items-center justify-center">
          <Logo />
        </div>
        <h1 className="text-xl font-semibold text-white text-center">Accept Your Invite</h1>
        {invitedEmail ? <p className="text-xs text-zinc-400 text-center">Invited email: {invitedEmail}</p> : null}

        {mode === 'loading' && <p className="text-sm text-zinc-400 text-center">Checking invite session...</p>}

        {mode === 'set_password' && (
          <form className="space-y-3" onSubmit={handleSetPassword}>
            <p className="text-sm text-zinc-400">Create your password to finish account setup.</p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create password"
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white outline-none focus:border-[#00e599]"
              required
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white outline-none focus:border-[#00e599]"
              required
            />
            <Button type="submit" className="w-full" isLoading={isSubmitting}>
              Create Password & Continue
            </Button>
          </form>
        )}

        {mode === 'invalid' && (
          <div className="space-y-3">
            <p className="text-sm text-zinc-300">
              This invite link is invalid or expired. Ask an admin to resend your invite.
            </p>
            <a
              href="mailto:support@p3lending.space?subject=Resend%20P3%20Invite"
              className="block text-center text-sm text-[#00e599] hover:underline"
            >
              Request New Invite
            </a>
            <a
              href={`${normalizePath(window.location.origin)}/`}
              className="block text-center text-xs text-zinc-500 hover:text-zinc-300"
            >
              Back to home
            </a>
          </div>
        )}

        {error ? <p className="text-xs text-red-400">{error}</p> : null}
      </div>
    </div>
  );
};

