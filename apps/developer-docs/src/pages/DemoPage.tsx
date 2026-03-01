// Mock B2B business website – inject P3 API keys to test reputation scoring
// Simulates a loan origination / underwriting platform powered by P3

import { useState } from 'react';
import { Link } from 'react-router-dom';

const API_BASE = 'https://api.p3lending.space';

export default function DemoPage() {
  const [apiKey, setApiKey] = useState('');
  const [lookupType, setLookupType] = useState<'user_id' | 'wallet'>('user_id');
  const [userId, setUserId] = useState('db5b7d0f-254a-412c-86a4-b50d822f57f3');
  const [wallet, setWallet] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; data?: unknown; error?: string } | null>(null);

  const runCheck = async () => {
    if (!apiKey.trim()) {
      setResult({ ok: false, error: 'Enter your P3 API key.' });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const url =
        lookupType === 'user_id'
          ? `${API_BASE}/api/v1/reputation/score?user_id=${encodeURIComponent(userId.trim())}`
          : `${API_BASE}/api/v1/reputation/score/by-wallet?address=${encodeURIComponent(wallet.trim())}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
      });
      const json = await res.json();
      if (res.ok) {
        setResult({ ok: true, data: json });
      } else {
        setResult({ ok: false, error: json.error || `HTTP ${res.status}` });
      }
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : 'Request failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col relative overflow-x-hidden selection:bg-[#00e599] selection:text-black">
      <div className="absolute inset-0 bg-grid-pattern opacity-20 pointer-events-none fixed z-0" aria-hidden />
      <div className="absolute top-[-10%] right-[-10%] w-[800px] h-[800px] bg-[#00e599]/5 rounded-full blur-[120px] pointer-events-none fixed z-0" aria-hidden />

      {/* Mock B2B header */}
      <header className="relative z-10 border-b border-zinc-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold text-white">PortfolioRisk</span>
            <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">Underwriting</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-zinc-500">Powered by</span>
            <Link to="/" className="text-[#00e599] hover:text-[#00cc88] font-medium">
              P3 Reputation API
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 relative z-10 max-w-4xl mx-auto w-full px-6 py-12">
        <h1 className="text-3xl font-bold mb-2">Applicant Reputation Check</h1>
        <p className="text-zinc-400 mb-8">
          Run a character-based trust score before approving credit. Integrates with P3.
        </p>

        {/* API key injection */}
        <div className="glass-panel rounded-xl p-6 mb-6 border border-zinc-800">
          <h2 className="text-lg font-semibold mb-3 text-white">API Configuration</h2>
          <label className="block text-sm text-zinc-400 mb-2">P3 API Key (inject your sandbox key)</label>
          <input
            type="password"
            placeholder="p3_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full px-4 py-3 bg-black/70 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#00e599] focus:border-transparent"
          />
        </div>

        {/* Lookup inputs */}
        <div className="glass-panel rounded-xl p-6 mb-6 border border-zinc-800">
          <h2 className="text-lg font-semibold mb-4 text-white">Lookup</h2>
          <div className="flex gap-4 mb-4">
            <button
              type="button"
              onClick={() => setLookupType('user_id')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                lookupType === 'user_id'
                  ? 'bg-[#00e599] text-black'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              By User ID
            </button>
            <button
              type="button"
              onClick={() => setLookupType('wallet')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                lookupType === 'wallet'
                  ? 'bg-[#00e599] text-black'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              By Wallet
            </button>
          </div>
          {lookupType === 'user_id' ? (
            <input
              type="text"
              placeholder="User UUID"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full px-4 py-3 bg-black/70 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#00e599]"
            />
          ) : (
            <input
              type="text"
              placeholder="0x..."
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              className="w-full px-4 py-3 bg-black/70 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#00e599]"
            />
          )}
        </div>

        <button
          type="button"
          onClick={runCheck}
          disabled={loading}
          className="w-full sm:w-auto px-8 py-4 bg-[#00e599] hover:bg-[#00cc88] disabled:opacity-50 text-black font-bold rounded-lg transition-colors shadow-[0_0_15px_rgba(0,229,153,0.3)]"
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              Checking reputation…
            </span>
          ) : (
            'Run Reputation Check'
          )}
        </button>

        {/* Result */}
        {result && (
          <div className="mt-8 glass-panel rounded-xl p-6 border border-zinc-800 overflow-x-auto">
            <h2 className="text-lg font-semibold mb-3 text-white">
              {result.ok ? 'Result' : 'Error'}
            </h2>
            {result.ok && result.data ? (
              <div className="space-y-3">
                <pre className="text-sm text-zinc-300 font-mono whitespace-pre-wrap break-words">
                  {JSON.stringify(result.data, null, 2)}
                </pre>
                {(result.data as { data?: { score?: number; band?: string } })?.data && (
                  <div className="flex gap-6 pt-4 border-t border-zinc-800">
                    <div>
                      <span className="text-zinc-500 text-sm">Score</span>
                      <p className="text-2xl font-bold text-[#00e599]">
                        {(result.data as { data?: { score?: number } }).data?.score ?? '—'}
                      </p>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-sm">Band</span>
                      <p className="text-2xl font-bold text-white">
                        {(result.data as { data?: { band?: string } }).data?.band ?? '—'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-red-400">{result.error}</p>
            )}
          </div>
        )}

        <p className="mt-8 text-zinc-500 text-sm">
          This is a demo. Get your API key from{' '}
          <Link to="/" className="text-[#00e599] hover:underline">
            P3 Developer Dashboard
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
