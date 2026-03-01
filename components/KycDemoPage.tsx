import React, { useState, useEffect, useCallback } from 'react';
import { Footer } from './Footer';
import { LegalDocType } from './LegalModal';
import { startKycSession, getKycStatus, KycStatusResponse } from '../services/kycDemoService';

const POLL_INTERVAL_MS = 3000;

export const KycDemoPage: React.FC = () => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [verificationUrl, setVerificationUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<KycStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const pollStatus = useCallback(async (id: string) => {
    try {
      const s = await getKycStatus(id);
      setStatus(s);
      return s;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch status');
      return null;
    }
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    const terminal = status && ['approved', 'rejected', 'error'].includes(status.status);
    if (terminal) return;

    const t = setInterval(() => pollStatus(sessionId), POLL_INTERVAL_MS);
    pollStatus(sessionId);
    return () => clearInterval(t);
  }, [sessionId, status?.status, pollStatus]);

  const handleStart = async () => {
    setIsStarting(true);
    setError(null);
    setStatus(null);
    try {
      const { sessionId: id, verificationUrl: url } = await startKycSession();
      setSessionId(id);
      setVerificationUrl(url);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start KYC');
    } finally {
      setIsStarting(false);
    }
  };

  const extracted = status?.extracted as Record<string, string> | undefined;
  const isVerified = status?.status === 'approved';

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-200 flex flex-col">
      <div className="max-w-2xl mx-auto px-6 py-12 flex-1">
        <a href="/" className="text-[11px] text-zinc-500 hover:text-[#00e599] transition-colors mb-6 inline-block">
          ← Back to Home
        </a>
        <h1 className="text-2xl font-bold text-white mb-2">KYC Investor Demo</h1>
        <p className="text-sm text-zinc-500 mb-8">
          Start verification → complete doc + selfie → see verified status and extracted fields.
        </p>

        {!sessionId ? (
          <div className="space-y-4">
            <button
              onClick={handleStart}
              disabled={isStarting}
              className="px-6 py-3 bg-[#00e599] text-black font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {isStarting ? 'Starting...' : 'Start KYC'}
            </button>
            {error && <p className="text-red-400 text-sm">{error}</p>}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <span className="text-zinc-500 text-sm">Status:</span>
              <span
                className={`font-mono text-sm font-semibold ${
                  isVerified ? 'text-[#00e599]' : status?.status === 'rejected' || status?.status === 'error' ? 'text-red-400' : 'text-amber-400'
                }`}
              >
                {status?.status?.toUpperCase() ?? 'PENDING'}
              </span>
            </div>

            {verificationUrl && (
              <p className="text-sm text-zinc-500">
                Verification opened in new tab.{' '}
                <a
                  href={verificationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#00e599] hover:underline"
                >
                  Open again
                </a>
              </p>
            )}

            {isVerified && extracted && (
              <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4 space-y-2">
                <h2 className="text-sm font-semibold text-zinc-300">Extracted fields</h2>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  {extracted.firstName && <><dt className="text-zinc-500">First name</dt><dd>{extracted.firstName}</dd></>}
                  {extracted.lastName && <><dt className="text-zinc-500">Last name</dt><dd>{extracted.lastName}</dd></>}
                  {extracted.dateOfBirth && <><dt className="text-zinc-500">Date of birth</dt><dd>{extracted.dateOfBirth}</dd></>}
                  {extracted.documentType && <><dt className="text-zinc-500">Document type</dt><dd>{extracted.documentType}</dd></>}
                  {extracted.country && <><dt className="text-zinc-500">Country</dt><dd>{extracted.country}</dd></>}
                </dl>
              </div>
            )}

            {error && <p className="text-red-400 text-sm">{error}</p>}
          </div>
        )}
      </div>
      <Footer onOpenLegal={(_t: LegalDocType) => {}} />
    </div>
  );
};
