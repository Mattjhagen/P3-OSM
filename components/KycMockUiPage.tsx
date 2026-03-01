import React, { useState, useEffect } from 'react';

/**
 * Mock KYC verification UI for investor demo.
 * Shown when user opens verification URL (demo or mock OpenKYC).
 * Simulates doc upload + selfie flow; auto-completes after 10s or on button click.
 */

const DEMO_APPROVAL_MS = 10000;
const MOCK_OPENKYC_BASE = typeof window !== 'undefined' ? 'http://localhost:8787' : '';

function isMockOpenkycSession(id: string) {
  return id.startsWith('mock_');
}

export const KycMockUiPage: React.FC = () => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [step, setStep] = useState<'doc' | 'selfie' | 'complete'>('doc');
  const [countdown, setCountdown] = useState(DEMO_APPROVAL_MS / 1000);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('sessionId');
    setSessionId(id);
  }, []);

  useEffect(() => {
    if (!sessionId || done) return;
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          setStep('complete');
          setDone(true);
          if (sessionId && isMockOpenkycSession(sessionId)) {
            fetch(`${MOCK_OPENKYC_BASE}/sessions/${sessionId}/complete`, { method: 'POST' }).catch(() => {});
          }
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [sessionId, done]);

  const handleComplete = () => {
    setStep('complete');
    setDone(true);
    if (sessionId && isMockOpenkycSession(sessionId)) {
      fetch(`${MOCK_OPENKYC_BASE}/sessions/${sessionId}/complete`, { method: 'POST' }).catch(() => {});
    }
  };

  if (!sessionId) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center">
        <p className="text-zinc-400">Missing session. Start verification from the demo page.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-200 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full space-y-6 text-center">
        <h1 className="text-xl font-bold text-white">KYC Verification (Demo)</h1>

        {step === 'doc' && (
          <>
            <p className="text-zinc-400 text-sm">Step 1: Document capture</p>
            <div className="h-32 rounded-lg border-2 border-dashed border-zinc-600 flex items-center justify-center text-zinc-500 text-sm">
              [Simulated ID document upload]
            </div>
            <button
              onClick={() => setStep('selfie')}
              className="px-4 py-2 bg-zinc-700 text-white rounded-lg hover:bg-zinc-600"
            >
              Continue
            </button>
          </>
        )}

        {step === 'selfie' && !done && (
          <>
            <p className="text-zinc-400 text-sm">Step 2: Selfie verification</p>
            <div className="h-32 rounded-lg border-2 border-dashed border-zinc-600 flex items-center justify-center text-zinc-500 text-sm">
              [Simulated selfie capture]
            </div>
            <p className="text-amber-400/90 text-xs">Auto-completes in {countdown}s or click below</p>
            <button
              onClick={handleComplete}
              className="px-4 py-2 bg-[#00e599] text-black font-semibold rounded-lg hover:opacity-90"
            >
              Complete verification
            </button>
          </>
        )}

        {done && (
          <>
            <p className="text-[#00e599] font-semibold">Verification complete</p>
            <p className="text-zinc-500 text-sm">You can close this window and return to the demo page.</p>
          </>
        )}
      </div>
    </div>
  );
};
