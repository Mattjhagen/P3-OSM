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

const CARD_LOADING_MESSAGES = [
  'Brewing trust particles…',
  'Consulting blockchain elders…',
  'No FICO harmed…',
  'Character assembling…',
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
  const [cardLoadingMsg, setCardLoadingMsg] = useState('');
  const loadingIndexRef = useRef(0);
  const cardMsgIndexRef = useRef(0);

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

  useEffect(() => {
    if (!isRefreshing) {
      setCardLoadingMsg('');
      return;
    }
    setCardLoadingMsg(CARD_LOADING_MESSAGES[0]);
    cardMsgIndexRef.current = 0;
    const cycle = setInterval(() => {
      cardMsgIndexRef.current += 1;
      setCardLoadingMsg(CARD_LOADING_MESSAGES[cardMsgIndexRef.current % CARD_LOADING_MESSAGES.length]);
    }, 450);
    return () => clearInterval(cycle);
  }, [isRefreshing]);

  const copyKey = () => {
    navigator.clipboard.writeText(apiKey);
    alert('API Key copied!');
  };

  return (
    <div className="min-h-screen bg-black/75 md:bg-gray-950/80 text-white flex flex-col lg:flex-row selection:bg-[#00e599] selection:text-black relative overflow-x-hidden">
      {/* Background effects – grid + green glow (let backdrop peek through) */}
      <div className="absolute inset-0 bg-grid-pattern opacity-20 pointer-events-none fixed z-0" aria-hidden />
      <div className="absolute top-[-10%] right-[-10%] w-[800px] h-[800px] bg-[#00e599]/5 rounded-full blur-[120px] pointer-events-none fixed z-0" aria-hidden />
      {/* Mobile sidebar toggle */}
      <button
        type="button"
        onClick={() => setSidebarOpen((o) => !o)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-gray-900/85 border border-gray-600 backdrop-blur-md text-white hover:text-green-300 transition-colors"
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
          fixed lg:static inset-y-0 left-0 z-40 w-64 bg-gray-900/85 backdrop-blur-md border-r border-gray-600
          transform transition-transform duration-200 ease-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <nav className="p-6 pt-20 lg:pt-8 flex flex-col gap-1">
          <a href="/" className="text-lg font-bold text-green-300 mb-4 hover:text-green-400 transition-colors">
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
                ${activeNav === item.id ? 'bg-green-500/80 text-white border border-green-400/50' : 'text-gray-300 hover:bg-gray-800/80 hover:text-white border border-transparent'}
              `}
            >
              {item.label}
            </button>
          ))}
          <a
            href="/docs.html"
            className="mt-4 px-4 py-3 rounded-lg text-gray-300 hover:bg-gray-800/80 hover:text-white font-medium transition-colors"
          >
            Full Docs →
          </a>
          <a
            href="/pricing"
            className="mt-1 px-4 py-3 rounded-lg text-gray-300 hover:bg-gray-800/80 hover:text-white font-medium transition-colors"
          >
            Pricing
          </a>
        </nav>
      </aside>

      {/* Overlay when sidebar open on mobile */}
      {sidebarOpen && (
        <div
          role="presentation"
          className="lg:hidden fixed inset-0 bg-black/75 z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="flex-1 p-6 lg:p-8 pb-20 overflow-auto relative z-10 bg-black/92 md:bg-transparent">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-6 lg:mb-8">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white cursor-default whitespace-nowrap hover:shadow-[0_0_20px_rgba(34,197,94,0.4)] transition-shadow duration-200 w-fit">
              P3 Labs,
            </h1>
            <p className="text-gray-300 text-lg font-light italic mt-0.5">
              No FICO. No black boxes. Just on-chain character.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <div className="hidden sm:flex items-center gap-4 text-sm text-gray-300">
              <a href="https://blog.p3lending.space" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                Blog
              </a>
              <a href="https://learn.p3lending.space" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                Learn
              </a>
              <a href="https://developers.p3lending.space" className="text-green-300">
                Developers
              </a>
            </div>
            <a
              href="/pricing"
              className="inline-flex items-center justify-center bg-green-500/80 hover:bg-green-500 px-4 sm:px-6 py-2 sm:py-3 rounded-lg font-semibold text-sm sm:text-base text-white transition-all"
            >
              Upgrade Plan
            </a>
            <a
              href="/docs.html"
              className="inline-flex items-center justify-center border border-gray-600 hover:border-green-500/50 text-gray-300 hover:text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg text-sm sm:text-base transition-colors"
            >
              Docs
            </a>
          </div>
        </header>

        {/* Loading message */}
        {isRefreshing && (
          <div className="mb-6 text-sm text-gray-300 italic flex items-center gap-2">
            <span className="w-3 h-3 border-2 border-green-300 border-t-transparent rounded-full animate-spin" />
            {loadingMessage}
          </div>
        )}

        {/* Content by section */}
        {activeNav === 'dashboard' && (
          <>
        {/* Stats Grid – with pulse animation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8 mb-8 lg:mb-12">
          <div className="relative bg-gray-900/85 backdrop-blur-md p-6 sm:p-8 rounded-2xl border border-gray-600 overflow-hidden group hover:border-green-500/40 transition-colors">
            {isRefreshing && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-2xl">
                <p key={cardLoadingMsg} className="text-green-300 text-sm sm:text-base font-medium animate-loading-fade">
                  {cardLoadingMsg}
                </p>
              </div>
            )}
            <span className="absolute inset-0 animate-pulse-slow opacity-0 group-hover:opacity-100 bg-green-500/5" />
            <div className="relative">
              <p className="text-gray-300 mb-2 text-sm sm:text-base">Wallets You've Scored Today</p>
              <p className={`text-3xl sm:text-5xl font-bold text-green-300 transition-all ${justUpdated ? 'animate-number-pop' : ''}`}>
                {usage.today}
              </p>
              <p className="text-xs sm:text-sm mt-2 text-gray-300">of {usage.limit} free tier limit</p>
            </div>
            <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-[0_0_6px_rgba(74,222,128,0.6)]" aria-hidden />
          </div>
          <div className="relative bg-gray-900/85 backdrop-blur-md p-6 sm:p-8 rounded-2xl border border-gray-600 overflow-hidden group hover:border-green-500/40 transition-colors" title="You're helping protocols stop relying on credit scores — nice.">
            {isRefreshing && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-2xl">
                <p key={cardLoadingMsg} className="text-green-300 text-sm sm:text-base font-medium animate-loading-fade">
                  {cardLoadingMsg}
                </p>
              </div>
            )}
            <span className="absolute inset-0 animate-pulse-slow opacity-0 group-hover:opacity-100 bg-green-500/5" />
            <div className="relative">
              <p className="text-gray-300 mb-2 text-sm sm:text-base">Trust Queries This Month</p>
              <p className={`text-3xl sm:text-5xl font-bold text-green-300 transition-all ${justUpdated ? 'animate-number-pop' : ''}`}>
                {usage.month}
              </p>
              <p className="text-xs sm:text-sm mt-2 text-gray-300">Up 17% — trust is spreading</p>
            </div>
            <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-[0_0_6px_rgba(74,222,128,0.6)]" aria-hidden />
          </div>
          <div className="relative bg-gray-900/85 backdrop-blur-md p-6 sm:p-8 rounded-2xl border border-gray-600 overflow-hidden group hover:border-green-500/40 transition-colors sm:col-span-2 lg:col-span-1">
            <span className="absolute inset-0 animate-pulse-slow opacity-0 group-hover:opacity-100 bg-green-500/5" />
            <div className="relative">
              <p className="text-gray-300 mb-2 text-sm sm:text-base">Your Access Key to the Trust Layer</p>
              <div className="flex flex-wrap items-center gap-3">
                <code className="bg-black/70 border border-gray-600 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm truncate max-w-[180px] sm:max-w-none text-white">
                  {apiKey.slice(0, 12)}...
                </code>
                <button
                  type="button"
                  onClick={copyKey}
                  className="text-green-300 hover:text-green-400 font-medium text-sm transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>
            <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-[0_0_6px_rgba(74,222,128,0.6)]" aria-hidden />
          </div>
        </div>

        {/* Recent Activity */}
        <section className="relative bg-gray-900/85 backdrop-blur-md p-6 sm:p-10 rounded-2xl mb-8 lg:mb-12 border border-gray-600">
          {isRefreshing && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-2xl">
              <p key={cardLoadingMsg} className="text-green-400/90 text-sm sm:text-base font-medium animate-loading-fade">
                {cardLoadingMsg}
              </p>
            </div>
          )}
          <h2 className="text-xl sm:text-3xl font-bold mb-4 sm:mb-6 text-white">Lives We've Scored Lately</h2>
          <div className="space-y-3 sm:space-y-4">
            {recentScores.map((req, i) => (
              <div
                key={`${req.wallet}-${i}`}
                className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 bg-black/50 border border-gray-600 p-4 sm:p-6 rounded-lg hover:border-green-500/30 transition-colors"
              >
                <div>
                  <p className="font-semibold text-sm sm:text-base text-white">{req.wallet}</p>
                  <p className="text-gray-300 text-xs sm:text-sm">Character score: <span className="text-green-300 font-mono">{req.score}</span></p>
                </div>
                <span className="text-gray-300 text-xs sm:text-sm">{req.time}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Quick Start */}
        <section className="bg-gray-900/85 backdrop-blur-md border border-gray-600 p-6 sm:p-10 rounded-2xl text-center">
          <h2 className="text-xl sm:text-3xl font-bold mb-4 sm:mb-6 text-white">Ready to Go?</h2>
          <p className="text-base sm:text-xl mb-6 sm:mb-8 text-gray-300">
            Paste this into your app—get trust scores in seconds.
          </p>
          <pre className="text-left bg-black/70 border border-gray-600 rounded-xl p-4 sm:p-6 overflow-x-auto text-xs sm:text-sm">
            <code className="text-white">{`fetch('https://api.p3lending.space/api/v1/reputation/score/by-wallet?address=0x123...', {
  headers: { 'Authorization': 'Bearer YOUR_KEY' }
})
.then(res => res.json())
.then(data => console.log(data));`}</code>
          </pre>
        </section>

        {/* Manifesto footer – dashboard only */}
        <footer className="mt-12 pt-8 border-t border-gray-600">
          <p className="text-sm text-gray-300 italic mb-4">
            We score character, not history. You're building the future of trust.
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <a href="https://blog.p3lending.space" target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-white transition-colors">
              Blog
            </a>
            <a href="https://learn.p3lending.space" target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-white transition-colors">
              Learn
            </a>
            <a href="https://developers.p3lending.space" className="text-gray-300 hover:text-white transition-colors">
              Developers
            </a>
          </div>
        </footer>
          </>
        )}

        {activeNav === 'api-docs' && (
          <section className="space-y-8">
            <h2 className="text-2xl font-bold text-white">API Documentation</h2>
            <p className="text-gray-300">
              Full API docs, endpoints, and OpenAPI spec in{' '}
              <a href="/docs.html" className="text-green-300 hover:text-green-400 hover:underline">
                Full Docs
              </a>
            </p>
            <div className="bg-gray-900/85 backdrop-blur-md p-6 rounded-xl border border-gray-600">
              <h3 className="font-semibold mb-2 text-white">Base URL</h3>
              <code className="text-green-300">https://api.p3lending.space</code>
            </div>
          </section>
        )}

        {activeNav === 'usage' && (
          <section className="space-y-8">
            <h2 className="text-2xl font-bold text-white">Usage & Limits</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-gray-900/85 backdrop-blur-md p-6 rounded-xl border border-gray-600">
                <p className="text-gray-300 text-sm">Free tier</p>
                <p className="text-2xl font-bold text-green-300">{usage.limit} trust queries/month</p>
              </div>
              <div className="bg-gray-900/85 backdrop-blur-md p-6 rounded-xl border border-gray-600">
                <p className="text-gray-300 text-sm">Used this month</p>
                <p className="text-2xl font-bold text-green-300">{usage.month}</p>
              </div>
            </div>
          </section>
        )}

        {activeNav === 'settings' && (
          <section className="space-y-8">
            <h2 className="text-2xl font-bold text-white">Settings</h2>
            <div className="bg-gray-900/85 backdrop-blur-md p-6 rounded-xl border border-gray-600 max-w-md">
              <label className="block text-gray-300 text-sm mb-2">Your Access Key to the Trust Layer</label>
              <div className="flex gap-2">
                <code className="flex-1 bg-black/70 border border-gray-600 px-4 py-2 rounded-lg text-sm truncate text-white">{apiKey}</code>
                <button
                  type="button"
                  onClick={copyKey}
                  className="px-4 py-2 bg-green-500/80 hover:bg-green-500 text-white rounded-lg font-medium text-sm transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Referral banner – sticky bottom */}
        <div className="fixed bottom-0 left-0 lg:left-64 right-0 z-20 flex items-center justify-between gap-4 px-4 py-3 bg-gray-900/85 backdrop-blur-md border-t border-gray-600">
          <p className="text-gray-300 text-sm">
            Refer a dev—both get $25 credit on upgrade. Share: p3lending.space/ref/
          </p>
          <button
            type="button"
            onClick={() => window.open('https://p3lending.space/ref/', '_blank')}
            className="shrink-0 px-4 py-2 bg-green-500/80 hover:bg-green-500 text-white rounded-lg font-medium text-sm transition-colors"
          >
            Get Your Link
          </button>
        </div>

        {/* Global footer – all pages */}
        <footer className="mt-12 pt-8 border-t border-gray-600">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <a href="https://blog.p3lending.space" target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-white transition-colors">
              Blog
            </a>
            <a href="https://learn.p3lending.space" target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-white transition-colors">
              Learn
            </a>
            <a href="https://developers.p3lending.space" className="text-gray-300 hover:text-white transition-colors">
              Developers
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}
