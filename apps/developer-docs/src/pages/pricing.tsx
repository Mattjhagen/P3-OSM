// P3 Developer Pricing – developers.p3lending.space
// Requires auth for checkout; unique referral link per user

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const PLANS = [
  {
    id: 'launch',
    title: 'Launch',
    price: '$29.99/mo',
    bullets: ['Up to 5,000 calls/month', 'Basic webhooks', 'Email support'],
    featured: false,
  },
  {
    id: 'core',
    title: 'Core',
    price: '$49.99/mo',
    bullets: ['Up to 20,000 calls/month', 'Priority support', 'Custom fields'],
    featured: true,
  },
  {
    id: 'grow',
    title: 'Grow',
    price: '$99.99/mo',
    bullets: ['Unlimited calls', 'Analytics dashboard', 'White-label'],
    featured: false,
  },
] as const;

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const auth = useAuth();
  const navigate = useNavigate();
  const isLoggedIn = !!auth?.user;

  const handleCheckout = async (plan: string) => {
    if (!isLoggedIn) {
      navigate('/login?returnTo=/pricing');
      return;
    }
    setError(null);
    setLoading(plan);
    try {
      const token = auth?.session?.access_token;
      const res = await fetch(`/api/create-checkout?plan=${plan}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const text = await res.text();

      // If we got HTML (404, SPA fallback, or error page), the API isn't available
      const contentType = res.headers.get('content-type') || '';
      if (text.trimStart().startsWith('<') || contentType.includes('text/html')) {
        throw new Error(
          'Checkout service unavailable. Run with "netlify dev" for local testing, or ensure the Netlify function is deployed with STRIPE_SECRET_KEY.'
        );
      }

      let data: { url?: string; error?: string };
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('Invalid response from checkout service.');
      }

      if (!res.ok) {
        throw new Error(data?.error || 'Checkout failed');
      }

      const url = data.url;
      if (!url) throw new Error('No checkout URL returned');
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col relative overflow-x-hidden selection:bg-[#00e599] selection:text-black">
      {/* Background effects – grid + green glow */}
      <div className="absolute inset-0 bg-grid-pattern opacity-20 pointer-events-none fixed z-0" aria-hidden />
      <div className="absolute top-[-10%] right-[-10%] w-[800px] h-[800px] bg-[#00e599]/5 rounded-full blur-[120px] pointer-events-none fixed z-0" aria-hidden />

      <main className="flex-1 p-6 lg:p-12 pb-20 relative z-10">
        {/* Nav */}
        <nav className="flex justify-between items-center mb-12">
          <a href="/" className="text-lg font-bold text-[#00e599] hover:text-[#00cc88] transition-colors">
            P3 Developer
          </a>
          <div className="flex gap-4 items-center">
            <a href="/" className="text-zinc-400 hover:text-white transition-colors text-sm">Dashboard</a>
            <a href="/docs.html" className="text-zinc-400 hover:text-white transition-colors text-sm">Docs</a>
            {isLoggedIn ? (
              <button
                type="button"
                onClick={() => auth?.signOut()}
                className="text-zinc-400 hover:text-white transition-colors text-sm"
              >
                Sign out
              </button>
            ) : (
              <Link to="/login?returnTo=/pricing" className="text-[#00e599] hover:text-[#00cc88] font-medium text-sm">
                Sign in
              </Link>
            )}
          </div>
        </nav>

        {/* Hero */}
        <h1 className="text-4xl md:text-5xl font-bold text-center mb-12 border-b-4 border-[#00e599]/50 pb-4 w-fit mx-auto">
          Choose Your Power Level
        </h1>

        {/* Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`
                relative glass-panel p-8 rounded-2xl overflow-hidden group hover:border-[#00e599]/30 transition-colors
                ${plan.featured ? 'ring-2 ring-[#00e599] shadow-[0_0_30px_rgba(0,229,153,0.2)]' : ''}
              `}
            >
              {plan.featured && (
                <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-[#00e599] animate-pulse shadow-[0_0_6px_rgba(0,229,153,0.6)]" aria-hidden />
              )}
              <span className="absolute inset-0 animate-pulse-slow opacity-0 group-hover:opacity-100 bg-[#00e599]/5" />
              <div className="relative">
                <h2 className="text-3xl font-bold text-white mb-4">{plan.title}</h2>
                <p className="text-5xl font-bold text-[#00e599] mb-6">{plan.price}</p>
                <ul className="space-y-3 mb-8">
                  {plan.bullets.map((b) => (
                    <li key={b} className="text-zinc-400 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00e599] shrink-0" />
                      {b}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => handleCheckout(plan.id)}
                  disabled={!!loading}
                  className="w-full bg-[#00e599] hover:bg-[#00cc88] disabled:opacity-50 text-black font-bold py-4 px-8 rounded-lg transition-colors shadow-[0_0_15px_rgba(0,229,153,0.3)]"
                >
                  {loading === plan.id ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                      Redirecting…
                    </span>
                  ) : !isLoggedIn ? (
                    'Sign in to upgrade'
                  ) : (
                    `Get ${plan.title}`
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <p className="text-center text-red-400 mt-6">{error}</p>
        )}

        <p className="text-center text-zinc-500 mt-12">
          Plans auto-renew monthly. Cancel anytime. First month free if you refer a friend.
        </p>

        {/* Referral banner – sticky bottom; unique link when logged in */}
        <div className="fixed bottom-0 left-0 right-0 z-20 flex items-center justify-between gap-4 px-4 py-3 bg-zinc-900/95 backdrop-blur-md border-t border-zinc-800">
          <p className="text-zinc-400 text-sm">
            {isLoggedIn ? (
              <>Refer a dev—both get $25 credit on upgrade. Your link: <code className="text-[#00e599] font-mono text-xs">https://p3lending.space/?ref={auth?.user?.id}</code></>
            ) : (
              <>Refer a dev—both get $25 credit on upgrade. <Link to="/login?returnTo=/pricing" className="text-[#00e599] hover:underline">Sign in</Link> to get your unique referral link.</>
            )}
          </p>
          {isLoggedIn ? (
            <button
              type="button"
              onClick={() => {
                const link = `https://p3lending.space/?ref=${auth?.user?.id}`;
                navigator.clipboard.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="shrink-0 px-4 py-2 bg-[#00e599] hover:bg-[#00cc88] text-black rounded-lg font-bold text-sm transition-colors shadow-[0_0_15px_rgba(0,229,153,0.3)]"
            >
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
          ) : (
            <Link
              to="/login?returnTo=/pricing"
              className="shrink-0 px-4 py-2 bg-[#00e599] hover:bg-[#00cc88] text-black rounded-lg font-bold text-sm transition-colors shadow-[0_0_15px_rgba(0,229,153,0.3)]"
            >
              Sign in for Link
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}
