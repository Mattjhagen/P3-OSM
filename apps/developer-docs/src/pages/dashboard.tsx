// P3 Developer Dashboard – developers.p3lending.space
// Interactive dashboard, live stats, API usage, quick keys

import { useState, useEffect } from 'react';

type NavSection = 'dashboard' | 'api-docs' | 'usage' | 'settings';

const NAV_ITEMS: { id: NavSection; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'api-docs', label: 'API Docs' },
  { id: 'usage', label: 'Usage' },
  { id: 'settings', label: 'Settings' },
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

  useEffect(() => {
    const interval = setInterval(() => {
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
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const copyKey = () => {
    navigator.clipboard.writeText(apiKey);
    alert('API Key copied!');
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 flex flex-col lg:flex-row">
      {/* Mobile sidebar toggle */}
      <button
        type="button"
        onClick={() => setSidebarOpen((o) => !o)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700"
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
          fixed lg:static inset-y-0 left-0 z-40 w-64 bg-gray-900 border-r border-gray-800
          transform transition-transform duration-200 ease-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <nav className="p-6 pt-20 lg:pt-8 flex flex-col gap-1">
          <a href="/" className="text-lg font-bold text-indigo-400 mb-4">
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
                ${activeNav === item.id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}
              `}
            >
              {item.label}
            </button>
          ))}
          <a
            href="/docs.html"
            className="mt-4 px-4 py-3 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-gray-200 font-medium transition-colors"
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
        <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8 lg:mb-12">
          <h1 className="text-2xl sm:text-4xl font-bold">P3 Developer Dashboard</h1>
          <div className="flex flex-wrap gap-3">
            <a
              href="mailto:founders@p3lending.space?subject=Upgrade%20P3%20API"
              className="inline-flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 px-4 sm:px-6 py-2 sm:py-3 rounded-lg font-semibold text-sm sm:text-base transition-colors"
            >
              Upgrade Plan
            </a>
            <a
              href="/docs.html"
              className="inline-flex items-center justify-center border border-indigo-500 hover:bg-indigo-900 px-4 sm:px-6 py-2 sm:py-3 rounded-lg text-sm sm:text-base transition-colors"
            >
              Docs
            </a>
          </div>
        </header>

        {/* Content by section */}
        {activeNav === 'dashboard' && (
          <>
        {/* Stats Grid – with pulse animation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8 mb-8 lg:mb-12">
          <div className="relative bg-gray-900 p-6 sm:p-8 rounded-2xl border border-gray-800 overflow-hidden group">
            <span className="absolute inset-0 animate-pulse-slow opacity-0 group-hover:opacity-100 bg-indigo-500/5" />
            <div className="relative">
              <p className="text-gray-400 mb-2 text-sm sm:text-base">Calls Today</p>
              <p className="text-3xl sm:text-5xl font-bold text-indigo-400">{usage.today}</p>
              <p className="text-xs sm:text-sm mt-2 text-gray-500">of {usage.limit} free tier limit</p>
            </div>
            <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-indigo-400 animate-pulse" aria-hidden />
          </div>
          <div className="relative bg-gray-900 p-6 sm:p-8 rounded-2xl border border-gray-800 overflow-hidden group">
            <span className="absolute inset-0 animate-pulse-slow opacity-0 group-hover:opacity-100 bg-green-500/5" />
            <div className="relative">
              <p className="text-gray-400 mb-2 text-sm sm:text-base">Monthly Usage</p>
              <p className="text-3xl sm:text-5xl font-bold text-green-400">{usage.month}</p>
              <p className="text-xs sm:text-sm mt-2 text-gray-500">+17% from last month</p>
            </div>
            <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-green-400 animate-pulse" aria-hidden />
          </div>
          <div className="relative bg-gray-900 p-6 sm:p-8 rounded-2xl border border-gray-800 overflow-hidden group sm:col-span-2 lg:col-span-1">
            <span className="absolute inset-0 animate-pulse-slow opacity-0 group-hover:opacity-100 bg-indigo-500/5" />
            <div className="relative">
              <p className="text-gray-400 mb-2 text-sm sm:text-base">API Key</p>
              <div className="flex flex-wrap items-center gap-3">
                <code className="bg-gray-800 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm truncate max-w-[180px] sm:max-w-none">
                  {apiKey.slice(0, 12)}...
                </code>
                <button
                  type="button"
                  onClick={copyKey}
                  className="text-indigo-400 hover:text-indigo-300 font-medium text-sm transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>
            <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-indigo-400 animate-pulse" aria-hidden />
          </div>
        </div>

        {/* Recent Activity */}
        <section className="bg-gray-900 p-6 sm:p-10 rounded-2xl mb-8 lg:mb-12">
          <h2 className="text-xl sm:text-3xl font-bold mb-4 sm:mb-6">Recent Score Requests</h2>
          <div className="space-y-3 sm:space-y-4">
            {recentScores.map((req, i) => (
              <div
                key={`${req.wallet}-${i}`}
                className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 bg-gray-800 p-4 sm:p-6 rounded-lg"
              >
                <div>
                  <p className="font-semibold text-sm sm:text-base">{req.wallet}</p>
                  <p className="text-gray-400 text-xs sm:text-sm">Score: {req.score}%</p>
                </div>
                <span className="text-gray-500 text-xs sm:text-sm">{req.time}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Quick Start */}
        <section className="bg-gradient-to-r from-indigo-950 to-purple-950 p-6 sm:p-10 rounded-2xl text-center">
          <h2 className="text-xl sm:text-3xl font-bold mb-4 sm:mb-6">Ready to Go?</h2>
          <p className="text-base sm:text-xl mb-6 sm:mb-8 opacity-90">
            Paste this into your app—get trust scores in seconds.
          </p>
          <pre className="text-left bg-gray-900/80 rounded-xl p-4 sm:p-6 overflow-x-auto text-xs sm:text-sm">
            <code className="text-gray-300">{`fetch('https://api.p3lending.space/api/v1/reputation/score/by-wallet?address=0x123...', {
  headers: { 'Authorization': 'Bearer YOUR_KEY' }
})
.then(res => res.json())
.then(data => console.log(data));`}</code>
          </pre>
        </section>
          </>
        )}

        {activeNav === 'api-docs' && (
          <section className="space-y-8">
            <h2 className="text-2xl font-bold">API Documentation</h2>
            <p className="text-gray-400">
              Full API docs, endpoints, and OpenAPI spec in{' '}
              <a href="/docs.html" className="text-indigo-400 hover:underline">
                Full Docs
              </a>
            </p>
            <div className="bg-gray-900 p-6 rounded-xl border border-gray-800">
              <h3 className="font-semibold mb-2">Base URL</h3>
              <code className="text-indigo-400">https://api.p3lending.space</code>
            </div>
          </section>
        )}

        {activeNav === 'usage' && (
          <section className="space-y-8">
            <h2 className="text-2xl font-bold">Usage & Limits</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-gray-900 p-6 rounded-xl border border-gray-800">
                <p className="text-gray-400 text-sm">Free tier</p>
                <p className="text-2xl font-bold text-indigo-400">{usage.limit} calls/month</p>
              </div>
              <div className="bg-gray-900 p-6 rounded-xl border border-gray-800">
                <p className="text-gray-400 text-sm">Used this month</p>
                <p className="text-2xl font-bold text-green-400">{usage.month}</p>
              </div>
            </div>
          </section>
        )}

        {activeNav === 'settings' && (
          <section className="space-y-8">
            <h2 className="text-2xl font-bold">Settings</h2>
            <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 max-w-md">
              <label className="block text-gray-400 text-sm mb-2">API Key</label>
              <div className="flex gap-2">
                <code className="flex-1 bg-gray-800 px-4 py-2 rounded-lg text-sm truncate">{apiKey}</code>
                <button
                  type="button"
                  onClick={copyKey}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-medium text-sm"
                >
                  Copy
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
