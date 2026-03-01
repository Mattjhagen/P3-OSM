// P3 Developer Pricing – developers.p3lending.space

import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';

const stripePromise = loadStripe('pk_live_51T5yMTBhAu0E0SSFOApOKDuW0l5B4dwTAlOXlNfgZU6aiTxrUcNMa4MBrbHyZGcHsoQzJZo0ngVuRCDlUv17dcpN00BAjt1ngx');

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

  const handleCheckout = async (plan: string) => {
    setError(null);
    setLoading(plan);
    try {
      const res = await fetch(`/api/create-checkout?plan=${plan}`);
      if (!res.ok) throw new Error('Checkout failed');
      const data = await res.json();
      const sessionId = data.sessionId ?? data.id;
      const stripe = await stripePromise;
      if (!stripe) throw new Error('Stripe not loaded');
      await stripe.redirectToCheckout({ sessionId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-black/75 text-white flex flex-col relative overflow-x-hidden">
      {/* Background effects – grid + green glow */}
      <div className="absolute inset-0 bg-grid-pattern opacity-20 pointer-events-none fixed z-0" aria-hidden />
      <div className="absolute top-[-10%] right-[-10%] w-[800px] h-[800px] bg-[#00e599]/5 rounded-full blur-[120px] pointer-events-none fixed z-0" aria-hidden />

      <main className="flex-1 p-6 lg:p-12 pb-20 relative z-10">
        {/* Nav */}
        <nav className="flex justify-between items-center mb-12">
          <a href="/" className="text-lg font-bold text-green-300 hover:text-green-400 transition-colors">
            P3 Developer
          </a>
          <div className="flex gap-4">
            <a href="/" className="text-gray-300 hover:text-white transition-colors text-sm">Dashboard</a>
            <a href="/docs.html" className="text-gray-300 hover:text-white transition-colors text-sm">Docs</a>
          </div>
        </nav>

        {/* Hero */}
        <h1 className="text-4xl md:text-5xl font-bold text-center mb-12 border-b-4 border-green-500/50 pb-4 w-fit mx-auto">
          Choose Your Power Level
        </h1>

        {/* Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`
                relative bg-gray-900/85 backdrop-blur-md p-8 rounded-2xl border border-gray-600
                overflow-hidden group hover:border-green-500/40 transition-colors
                ${plan.featured ? 'border-2 border-green-500 shadow-lg shadow-green-500/20' : ''}
              `}
            >
              {plan.featured && (
                <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-[0_0_6px_rgba(74,222,128,0.6)]" aria-hidden />
              )}
              <span className="absolute inset-0 animate-pulse-slow opacity-0 group-hover:opacity-100 bg-green-500/5" />
              <div className="relative">
                <h2 className="text-3xl font-bold text-white mb-4">{plan.title}</h2>
                <p className="text-5xl font-bold text-green-300 mb-6">{plan.price}</p>
                <ul className="space-y-3 mb-8">
                  {plan.bullets.map((b) => (
                    <li key={b} className="text-gray-300 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-300 shrink-0" />
                      {b}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => handleCheckout(plan.id)}
                  disabled={!!loading}
                  className="w-full bg-green-500/80 hover:bg-green-500 disabled:opacity-50 text-white font-bold py-4 px-8 rounded-lg transition-colors"
                >
                  {loading === plan.id ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                      Redirecting…
                    </span>
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

        <p className="text-center text-gray-300 mt-12">
          Plans auto-renew monthly. Cancel anytime. First month free if you refer a friend.
        </p>

        {/* Referral banner – sticky bottom */}
        <div className="fixed bottom-0 left-0 right-0 z-20 flex items-center justify-between gap-4 px-4 py-3 bg-gray-900/85 backdrop-blur-md border-t border-gray-600">
          <p className="text-gray-300 text-sm">
            Refer a dev—both get $25 credit on upgrade. Share: p3lending.space/ref/
          </p>
          <a
            href="https://p3lending.space/ref/"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 px-4 py-2 bg-green-500/80 hover:bg-green-500 text-white rounded-lg font-medium text-sm transition-colors"
          >
            Get Your Link
          </a>
        </div>
      </main>
    </div>
  );
}
