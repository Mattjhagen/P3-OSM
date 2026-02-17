import React, { useEffect, useMemo, useState } from 'react';
import { Button } from './Button';
import { KYCTier } from '../types';
import {
  StripeKycSessionStatusDto,
  VerificationServiceClient,
} from '../services/verificationService';

interface Props {
  currentTier: KYCTier;
  userId: string;
  userEmail?: string;
  onClose: () => void;
  onUpgradeComplete: (newTier: KYCTier, limit: number, docData?: any) => void;
}

const KYC_SESSION_STORAGE_KEY = 'p3_kyc_last_session_id';

const tierToNumber = (tier: KYCTier) => {
  if (tier === KYCTier.TIER_1) return 1;
  if (tier === KYCTier.TIER_2) return 2;
  if (tier === KYCTier.TIER_3) return 3;
  return 0;
};

const numberToTier = (value: number): KYCTier => {
  if (value >= 3) return KYCTier.TIER_3;
  if (value >= 2) return KYCTier.TIER_2;
  if (value >= 1) return KYCTier.TIER_1;
  return KYCTier.TIER_0;
};

const tierToLimit = (tier: number) => {
  if (tier >= 3) return 1000000;
  if (tier >= 2) return 50000;
  if (tier >= 1) return 1000;
  return 0;
};

const getTierInfo = (tier: KYCTier) => {
  switch (tier) {
    case KYCTier.TIER_1:
      return {
        title: 'Basic Verification',
        limit: '$1,000',
        req: 'Legal Name, DOB, Address, Phone, Email, SSN Last 4, Annual Salary',
      };
    case KYCTier.TIER_2:
      return {
        title: 'Verified Identity',
        limit: '$50,000',
        req: 'Photo ID + Live Selfie + ID Number + Profile Intake',
      };
    case KYCTier.TIER_3:
      return {
        title: 'Enhanced Due Diligence',
        limit: '$1,000,000',
        req: 'Enhanced manual review and source-of-funds checks',
      };
    default:
      return {
        title: 'Unverified',
        limit: '$0',
        req: '',
      };
  }
};

const sanitizeSessionParams = () => {
  const params = new URLSearchParams(window.location.search || '');
  const keysToDelete = ['kyc', 'session_id'];
  let changed = false;

  for (const key of keysToDelete) {
    if (params.has(key)) {
      params.delete(key);
      changed = true;
    }
  }

  if (!changed) return;

  const nextQuery = params.toString();
  const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
  window.history.replaceState({}, document.title, nextUrl);
};

const formatStatusLabel = (status: string) => {
  const normalized = String(status || '').replace(/_/g, ' ').trim();
  if (!normalized) return 'UNKNOWN';
  return normalized.toUpperCase();
};

export const KYCVerificationModal: React.FC<Props> = ({
  currentTier,
  userId,
  userEmail,
  onClose,
  onUpgradeComplete,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);
  const [error, setError] = useState('');
  const [sessionStatus, setSessionStatus] = useState<StripeKycSessionStatusDto | null>(null);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    dob: '',
    address: '',
    phone: '',
    email: userEmail || '',
    ssnLast4: '',
    annualSalaryUsd: '',
  });

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      email: userEmail || prev.email,
    }));
  }, [userEmail]);

  const nextTier = useMemo(() => {
    if (currentTier === KYCTier.TIER_0) return KYCTier.TIER_1;
    if (currentTier === KYCTier.TIER_1) return KYCTier.TIER_2;
    return KYCTier.TIER_3;
  }, [currentTier]);

  const targetInfo = getTierInfo(nextTier);
  const targetTierNumber = tierToNumber(nextTier);

  const refreshLatestStatus = async () => {
    const sessionFromStorage = localStorage.getItem(KYC_SESSION_STORAGE_KEY) || '';
    const params = new URLSearchParams(window.location.search || '');
    const sessionFromQuery = String(params.get('session_id') || '').trim();
    const sessionId = sessionFromQuery || sessionFromStorage;

    if (!sessionId) {
      setError('No Stripe verification session found. Start verification to continue.');
      return;
    }

    setIsRefreshingStatus(true);
    setError('');
    try {
      const status = await VerificationServiceClient.getStripeIdentitySessionStatus({
        userId,
        sessionId,
        refresh: true,
      });
      setSessionStatus(status);

      if (status.status === 'verified' && !status.requiresManualReview) {
        localStorage.removeItem(KYC_SESSION_STORAGE_KEY);
        sanitizeSessionParams();

        const finalTier = numberToTier(status.requestedTier || targetTierNumber);
        const finalLimit = tierToLimit(status.requestedTier || targetTierNumber);

        onUpgradeComplete(finalTier, finalLimit, {
          provider: 'stripe_identity',
          sessionId: status.sessionId,
          status: status.status,
          submittedAt: Date.now(),
          verificationUrl: status.verificationUrl,
        });
        return;
      }

      if (status.status === 'requires_input' && status.verificationUrl) {
        setError('Stripe needs additional input. Use Continue Verification to complete checks.');
      } else if (status.requiresManualReview) {
        setError('Verification is pending manual review. Admin team has been notified.');
      } else if (status.status !== 'verified') {
        setError('Verification is still in progress. Refresh status after completing Stripe checks.');
      }
    } catch (statusError: any) {
      setError(statusError?.message || 'Unable to fetch Stripe verification status.');
    } finally {
      setIsRefreshingStatus(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search || '');
    const shouldResume = params.get('kyc') === 'stripe-return';

    if (!shouldResume) return;

    refreshLatestStatus();
  }, [userId]);

  const validateForm = () => {
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      return 'Enter your legal first and last name.';
    }

    if (!formData.dob.trim()) {
      return 'Date of birth is required.';
    }

    if (!formData.address.trim()) {
      return 'Residential address is required.';
    }

    if (!formData.phone.trim()) {
      return 'Phone number is required.';
    }

    if (!formData.email.trim()) {
      return 'Email is required.';
    }

    const ssnDigits = formData.ssnLast4.replace(/\D+/g, '');
    if (ssnDigits.length !== 4) {
      return 'Enter SSN last 4 digits.';
    }

    const salary = Number(formData.annualSalaryUsd);
    if (!Number.isFinite(salary) || salary < 0) {
      return 'Enter a valid annual salary in USD.';
    }

    return '';
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await VerificationServiceClient.createStripeIdentitySession({
        userId,
        userEmail: formData.email.trim(),
        userPhone: formData.phone.trim(),
        requestedTier: targetTierNumber,
        returnUrl: `${window.location.origin}/profile?kyc=stripe-return`,
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        dob: formData.dob.trim(),
        address: formData.address.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        ssnLast4: formData.ssnLast4.trim(),
        annualSalaryUsd: Number(formData.annualSalaryUsd),
      });

      if (!response.sessionId) {
        throw new Error('Stripe did not return a verification session id.');
      }

      localStorage.setItem(KYC_SESSION_STORAGE_KEY, response.sessionId);

      if (!response.url) {
        throw new Error('Stripe did not return a hosted verification URL.');
      }

      onUpgradeComplete(nextTier, tierToLimit(targetTierNumber), {
        provider: 'stripe_identity',
        sessionId: response.sessionId,
        status: response.status || 'processing',
        submittedAt: Date.now(),
        verificationUrl: response.url,
        requiresManualReview: false,
      });

      window.location.assign(response.url);
    } catch (submitError: any) {
      setError(submitError?.message || 'Unable to start Stripe Identity verification.');
      setIsSubmitting(false);
    }
  };

  const hasSessionToRefresh = Boolean(localStorage.getItem(KYC_SESSION_STORAGE_KEY));

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[100] p-4">
      <div className="bg-[#0a0a0a] border border-zinc-800 rounded-3xl max-w-xl w-full shadow-[0_0_50px_rgba(0,229,153,0.05)] overflow-hidden animate-fade-in relative max-h-[92vh] overflow-y-auto custom-scrollbar">
        <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none" />

        <div className="bg-zinc-900/50 p-6 border-b border-zinc-800 flex justify-between items-center relative z-10">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Identity Verification</h2>
            <p className="text-xs text-zinc-500 mt-1">Stripe Identity KYC flow</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-8 relative z-10">
          <div className="mb-6 bg-gradient-to-br from-[#00e599]/10 to-emerald-900/10 border border-[#00e599]/20 rounded-2xl p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-[#00e599]/10 blur-2xl rounded-full" />

            <h3 className="text-[#00e599] font-bold uppercase text-[10px] tracking-widest mb-2">Upgrading to</h3>
            <div className="flex justify-between items-end gap-4">
              <span className="text-2xl font-bold text-white">{targetInfo.title}</span>
              <span className="text-[#00e599] font-mono font-bold bg-[#00e599]/10 border border-[#00e599]/20 px-2 py-0.5 rounded text-sm">
                {targetInfo.limit} Limit
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-3">Requires: {targetInfo.req}</p>
          </div>

          {sessionStatus && (
            <div className="mb-4 rounded-xl border border-zinc-700 bg-zinc-900/70 p-3 text-sm text-zinc-200">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Stripe Status</span>
                <span className="font-mono text-xs">{formatStatusLabel(sessionStatus.status)}</span>
              </div>
              <div className="mt-2 text-xs text-zinc-400">Session: {sessionStatus.sessionId}</div>
              {sessionStatus.requiresManualReview && (
                <div className="mt-2 text-xs text-amber-300">
                  Manual review required. Admin team has been notified.
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-500 mb-2 uppercase tracking-wide font-bold">
                  Legal First Name
                </label>
                <input
                  required
                  type="text"
                  className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-white text-sm focus:border-[#00e599] outline-none transition-colors"
                  value={formData.firstName}
                  onChange={(e) => setFormData((prev) => ({ ...prev, firstName: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-2 uppercase tracking-wide font-bold">
                  Legal Last Name
                </label>
                <input
                  required
                  type="text"
                  className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-white text-sm focus:border-[#00e599] outline-none transition-colors"
                  value={formData.lastName}
                  onChange={(e) => setFormData((prev) => ({ ...prev, lastName: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-500 mb-2 uppercase tracking-wide font-bold">DOB</label>
                <input
                  required
                  type="date"
                  className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-white text-sm focus:border-[#00e599] outline-none transition-colors"
                  value={formData.dob}
                  onChange={(e) => setFormData((prev) => ({ ...prev, dob: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-2 uppercase tracking-wide font-bold">
                  SSN Last 4
                </label>
                <input
                  required
                  type="password"
                  maxLength={4}
                  inputMode="numeric"
                  className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-white text-sm focus:border-[#00e599] outline-none transition-colors"
                  value={formData.ssnLast4}
                  onChange={(e) => setFormData((prev) => ({ ...prev, ssnLast4: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-zinc-500 mb-2 uppercase tracking-wide font-bold">
                Residential Address
              </label>
              <input
                required
                type="text"
                className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-white text-sm focus:border-[#00e599] outline-none transition-colors"
                value={formData.address}
                onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-500 mb-2 uppercase tracking-wide font-bold">Phone</label>
                <input
                  required
                  type="tel"
                  className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-white text-sm focus:border-[#00e599] outline-none transition-colors"
                  value={formData.phone}
                  onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-2 uppercase tracking-wide font-bold">Email</label>
                <input
                  required
                  type="email"
                  className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-white text-sm focus:border-[#00e599] outline-none transition-colors"
                  value={formData.email}
                  onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-zinc-500 mb-2 uppercase tracking-wide font-bold">
                Annual Salary (USD)
              </label>
              <input
                required
                type="number"
                min="0"
                step="1"
                className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-white text-sm focus:border-[#00e599] outline-none transition-colors"
                value={formData.annualSalaryUsd}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, annualSalaryUsd: e.target.value }))
                }
              />
            </div>

            <p className="text-[11px] text-zinc-500">
              You will be redirected to Stripe to complete photo ID + live selfie verification.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
              <Button type="submit" className="w-full" isLoading={isSubmitting}>
                {isSubmitting ? 'Starting Stripe Verification...' : 'Start Stripe KYC'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={refreshLatestStatus}
                isLoading={isRefreshingStatus}
                disabled={!hasSessionToRefresh && !sessionStatus}
              >
                Refresh KYC Status
              </Button>
            </div>

            {sessionStatus?.verificationUrl && sessionStatus.status === 'requires_input' && (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => window.location.assign(String(sessionStatus.verificationUrl))}
              >
                Continue Verification
              </Button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};
