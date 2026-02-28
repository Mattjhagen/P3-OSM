// P3 Developer Dashboard – developers.p3lending.space
// Character-based trust. Same family as p3lending.space — black + vibrant green, manifesto tone.

import { useState, useEffect, useRef } from 'react';

type NavSection = 'dashboard' | 'api-docs' | 'usage' | 'settings';

const NAV_ITEMS: { id: NavSection; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'api-docs', label: 'API Docs' },
  { id: 'usage', label: 'Usage' },
  { id: 'settings', label: 'Settings' },
];

const LOADING_MESSAGES = [
  'Consulting the blockchain oracles…',
  'Brewing trust particles…',
  'No FICO crystals were harmed…',
  'Character data incoming…',
];

export default function DeveloperDashboard() {
  const [apiKey, setApiKey] = useState('pk_test_...');
  const [usage, setUsage] = useState({ today: 42, month: 187, limit: 1000 });
  const [recentScores, setRecentScores] = useState([
    { wallet: '0xabc...123', score: 78, time: '2m ago' },
    { wallet: '0xdef...456', score: 91, time: '5m ago' },
    { wallet: '0xghi...789', score: 45, time: '12m ago' },
  ]);
  const [activeNav, setActiveNav] = useState<NavSection>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [justUpdated, setJustUpdated] = useState(false);
  const loadingIndexRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsRefreshing(true);
      setLoadingMessage(LOADING_MESSAGES[loadingIndexRef.current % LOADING_MESSAGES.length]);
      loadingIndexRef.current += 1;

      setTimeout(() => {
        setUsage((prev) => ({
          ...prev,
          today: prev.today + Math.floor(Math.random() * 3),
          month: prev.month + Math.floor(Math.random() * 5),
        }));
        setRecentScores((prev) => {
          const newEntry = {
            wallet: `0x${Math.random().toString(36).slice(2, 10)}...`,
            score: Math.floor(Math.random() * 100),
            time: 'Just now',
          };
          return [newEntry, ...prev.slice(0, 4)];
        });
        setJustUpdated(true);
        setIsRefreshing(false);
        setLoadingMessage('');
        setTimeout(() => setJustUpdated(false), 600);
      }, 1200);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const copyKey = () => {
    navigator.clipboard.writeText(apiKey);
    alert('API Key copied!');
  };

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-200 flex flex-col lg:flex-row selection:bg-[#00e599] selection:text-black">
      {/* Mobile sidebar toggle */}
      <button
        type="button"
        onClick={() => setSidebarOpen((o) => !o)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-[#00e599] transition-colors"
        aria-label="Toggle menu"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {sidebarOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-40 w-64 bg-black/50 border-r border-zinc-800
          transform transition-transform duration-200 ease-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <nav className="p-6 pt-20 lg:pt-8 flex flex-col gap-1">
          <a href="/" className="text-lg font-bold text-[#00e599] mb-4 hover:text-[#00e599]/80 transition-colors">
            P3 Developer
          </a>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveNav(item.id);
                setSidebarOpen(false);
              }}
              className={`
                text-left px-4 py-3 rounded-lg font-medium transition-colors
                ${activeNav === item.id ? 'bg-[#00e599]/10 text-[#00e599] border border-[#00e599]/30' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white border border-transparent'}
              `}
            >
              {item.label}
            </button>
          ))}
          <a
            href="/docs.html"
            className="mt-4 px-4 py-3 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-[#00e599] font-medium transition-colors"
          >
            Full Docs →
          </a>
        </nav>
      </aside>

      {/* Overlay when sidebar open on mobile */}
      {sidebarOpen && (
        <div
          role="presentation"
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="flex-1 p-6 lg:p-8 overflow-auto">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-6 lg:mb-8">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-white cursor-default border-b-2 border-transparent hover:border-[#00e599]/50 transition-colors duration-200 w-fit">
                P3 Trust Engine
              </h1>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/80 border border-[#00e599]/30 text-[#00e599] text-[10px] font-bold uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00e599] animate-pulse shadow-[0_0_6px_#00e599]" />
                LIVE API
              </span>
            </div>
            <p className="text-zinc-400 text-lg md:text-xl font-light italic">
              No FICO. No black boxes. Just on-chain character.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <div className="hidden sm:flex items-center gap-4 text-sm text-zinc-500">
              <a href="https://blog.p3lending.space" target="_blank" rel="noopener noreferrer" className="hover:text-[#00e599] transition-colors">
                Blog
              </a>
              <a href="https://learn.p3lending.space" target="_blank" rel="noopener noreferrer" className="hover:text-[#00e599] transition-colors">
                Learn
              </a>
              <a href="https://developers.p3lending.space" className="text-[#00e599]">
                Developers
              </a>
            </div>
            <a
              href="mailto:founders@p3lending.space?subject=Upgrade%20P3%20API"
              className="inline-flex items-center justify-center border-2 border-[#00e599] border-opacity-60 hover:border-[#00e599] hover:shadow-[0_0_20px_rgba(0,229,153,0.3)] px-4 sm:px-6 py-2 sm:py-3 rounded-lg font-semibold text-sm sm:text-base text-[#00e599] hover:bg-[#00e599]/10 transition-all"
            >
              Upgrade Plan
            </a>
            <a
              href="/docs.html"
              className="inline-flex items-center justify-center border border-zinc-600 hover:border-[#00e599]/50 hover:text-[#00e599] px-4 sm:px-6 py-2 sm:py-3 rounded-lg text-sm sm:text-base transition-colors"
            >
              Docs
            </a>
          </div>
        </header>

        {/* Loading message */}
        {isRefreshing && (
          <div className="mb-6 text-sm text-zinc-500 italic flex items-center gap-2">
            <span className="w-3 h-3 border-2 border-[#00e599] border-t-transparent rounded-full animate-spin" />
            {loadingMessage}
          </div>
        )}

        {/* Content by section */}
        {activeNav === 'dashboard' && (
          <>
        {/* Stats Grid – with pulse animation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8 mb-8 lg:mb-12">
          <div className="relative bg-zinc-900/50 p-6 sm:p-8 rounded-2xl border border-zinc-800 overflow-hidden group hover:border-[#00e599]/30 transition-colors">
            <span className="absolute inset-0 animate-pulse-slow opacity-0 group-hover:opacity-100 bg-[#00e599]/5" />
            <div className="relative">
              <p className="text-zinc-400 mb-2 text-sm sm:text-base">Wallets You've Scored Today</p>
              <p className={`text-3xl sm:text-5xl font-bold text-[#00e599] transition-all ${justUpdated ? 'animate-number-pop' : ''}`}>
                {usage.today}
              </p>
              <p className="text-xs sm:text-sm mt-2 text-zinc-500">of {usage.limit} free tier limit</p>
            </div>
            <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-[#00e599] animate-pulse shadow-[0_0_6px_#00e599]" aria-hidden />
          </div>
          <div className="relative bg-zinc-900/50 p-6 sm:p-8 rounded-2xl border border-zinc-800 overflow-hidden group hover:border-[#00e599]/30 transition-colors" title="You're helping protocols stop relying on credit scores — nice.">
            <span className="absolute inset-0 animate-pulse-slow opacity-0 group-hover:opacity-100 bg-[#00e599]/5" />
            <div className="relative">
              <p className="text-zinc-400 mb-2 text-sm sm:text-base">Trust Queries This Month</p>
              <p className={`text-3xl sm:text-5xl font-bold text-[#00e599] transition-all ${justUpdated ? 'animate-number-pop' : ''}`}>
                {usage.month}
              </p>
              <p className="text-xs sm:text-sm mt-2 text-zinc-500">Up 17% — trust is spreading</p>
            </div>
            <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-[#00e599] animate-pulse shadow-[0_0_6px_#00e599]" aria-hidden />
          </div>
          <div className="relative bg-zinc-900/50 p-6 sm:p-8 rounded-2xl border border-zinc-800 overflow-hidden group hover:border-[#00e599]/30 transition-colors sm:col-span-2 lg:col-span-1">
            <span className="absolute inset-0 animate-pulse-slow opacity-0 group-hover:opacity-100 bg-[#00e599]/5" />
            <div className="relative">
              <p className="text-zinc-400 mb-2 text-sm sm:text-base">Your Access Key to the Trust Layer</p>
              <div className="flex flex-wrap items-center gap-3">
                <code className="bg-black/50 border border-zinc-800 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm truncate max-w-[180px] sm:max-w-none text-zinc-300">
                  {apiKey.slice(0, 12)}...
                </code>
                <button
                  type="button"
                  onClick={copyKey}
                  className="text-[#00e599] hover:text-[#00e599]/80 font-medium text-sm transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>
            <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-[#00e599] animate-pulse shadow-[0_0_6px_#00e599]" aria-hidden />
          </div>
        </div>

        {/* Recent Activity */}
        <section className="bg-zinc-900/50 p-6 sm:p-10 rounded-2xl mb-8 lg:mb-12 border border-zinc-800">
          <h2 className="text-xl sm:text-3xl font-bold mb-4 sm:mb-6 text-white">Lives We've Scored Lately</h2>
          <div className="space-y-3 sm:space-y-4">
            {recentScores.map((req, i) => (
              <div
                key={`${req.wallet}-${i}`}
                className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 bg-black/30 border border-zinc-800 p-4 sm:p-6 rounded-lg hover:border-[#00e599]/20 transition-colors"
              >
                <div>
                  <p className="font-semibold text-sm sm:text-base text-white">{req.wallet}</p>
                  <p className="text-zinc-400 text-xs sm:text-sm">Character score: <span className="text-[#00e599] font-mono">{req.score}</span></p>
                </div>
                <span className="text-zinc-500 text-xs sm:text-sm">{req.time}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Quick Start */}
        <section className="bg-gradient-to-r from-zinc-900 to-black border border-zinc-800 p-6 sm:p-10 rounded-2xl text-center">
          <h2 className="text-xl sm:text-3xl font-bold mb-4 sm:mb-6 text-white">Ready to Go?</h2>
          <p className="text-base sm:text-xl mb-6 sm:mb-8 text-zinc-400">
            Paste this into your app—get trust scores in seconds.
          </p>
          <pre className="text-left bg-black/50 border border-zinc-800 rounded-xl p-4 sm:p-6 overflow-x-auto text-xs sm:text-sm">
            <code className="text-zinc-300">{`fetch('https://api.p3lending.space/api/v1/reputation/score/by-wallet?address=0x123...', {
  headers: { 'Authorization': 'Bearer YOUR_KEY' }
})
.then(res => res.json())
.then(data => console.log(data));`}</code>
          </pre>
        </section>

        {/* Manifesto footer – dashboard only */}
        <footer className="mt-12 pt-8 border-t border-zinc-800">
          <p className="text-sm text-zinc-500 italic mb-4">
            We score character, not history. You're building the future of trust.
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <a href="https://blog.p3lending.space" target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-[#00e599] transition-colors">
              Blog
            </a>
            <a href="https://learn.p3lending.space" target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-[#00e599] transition-colors">
              Learn
            </a>
            <a href="https://developers.p3lending.space" className="text-zinc-500 hover:text-[#00e599] transition-colors">
              Developers
            </a>
          </div>
        </footer>
          </>
        )}

        {activeNav === 'api-docs' && (
          <section className="space-y-8">
            <h2 className="text-2xl font-bold text-white">API Documentation</h2>
            <p className="text-zinc-400">
              Full API docs, endpoints, and OpenAPI spec in{' '}
              <a href="/docs.html" className="text-[#00e599] hover:underline">
                Full Docs
              </a>
            </p>
            <div className="bg-zinc-900/50 p-6 rounded-xl border border-zinc-800">
              <h3 className="font-semibold mb-2 text-white">Base URL</h3>
              <code className="text-[#00e599]">https://api.p3lending.space</code>
            </div>
          </section>
        )}

        {activeNav === 'usage' && (
          <section className="space-y-8">
            <h2 className="text-2xl font-bold text-white">Usage & Limits</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-zinc-900/50 p-6 rounded-xl border border-zinc-800">
                <p className="text-zinc-400 text-sm">Free tier</p>
                <p className="text-2xl font-bold text-[#00e599]">{usage.limit} trust queries/month</p>
              </div>
              <div className="bg-zinc-900/50 p-6 rounded-xl border border-zinc-800">
                <p className="text-zinc-400 text-sm">Used this month</p>
                <p className="text-2xl font-bold text-[#00e599]">{usage.month}</p>
              </div>
            </div>
          </section>
        )}

        {activeNav === 'settings' && (
          <section className="space-y-8">
            <h2 className="text-2xl font-bold text-white">Settings</h2>
            <div className="bg-zinc-900/50 p-6 rounded-xl border border-zinc-800 max-w-md">
              <label className="block text-zinc-400 text-sm mb-2">Your Access Key to the Trust Layer</label>
              <div className="flex gap-2">
                <code className="flex-1 bg-black/50 border border-zinc-800 px-4 py-2 rounded-lg text-sm truncate text-zinc-300">{apiKey}</code>
                <button
                  type="button"
                  onClick={copyKey}
                  className="px-4 py-2 bg-[#00e599] text-black hover:bg-[#00cc88] rounded-lg font-medium text-sm transition-colors shadow-[0_0_15px_rgba(0,229,153,0.3)]"
                >
                  Copy
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Global footer – all pages */}
        <footer className="mt-12 pt-8 border-t border-zinc-800">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <a href="https://blog.p3lending.space" target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-[#00e599] transition-colors">
              Blog
            </a>
            <a href="https://learn.p3lending.space" target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-[#00e599] transition-colors">
              Learn
            </a>
            <a href="https://developers.p3lending.space" className="text-zinc-500 hover:text-[#00e599] transition-colors">
              Developers
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}
