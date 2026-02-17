import React from 'react';
import { Button } from './Button';

interface Props {
  onContinue: () => void;
  onViewPitchDeck: () => void;
}

const CONTACT_LINKS = [
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/in/mattjhagen/',
  },
  {
    label: 'Facebook',
    href: 'https://www.facebook.com/mattjhagen/',
  },
  {
    label: 'Reddit',
    href: 'https://www.reddit.com/user/PacMacMarket/',
  },
  {
    label: 'Email',
    href: 'mailto:admin@p3lending.space',
  },
  {
    label: 'Text',
    href: 'txt:+14028380848',
  },
];

const CALENDLY_URL = 'https://calendly.com/admin-p3lending/new-meeting';

export const DonationThankYouPage: React.FC<Props> = ({ onContinue, onViewPitchDeck }) => {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#050505] text-zinc-100">
      <div className="absolute inset-0 bg-grid-pattern opacity-20 pointer-events-none" />
      <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-[#00e599]/15 blur-3xl" />
      <div className="absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-5xl flex-col justify-center px-4 py-12 sm:px-6 lg:px-10">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-6 sm:p-8 lg:p-10">
          <div className="mb-6 inline-flex items-center rounded-full border border-[#00e599]/40 bg-[#00e599]/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#9ff8d7]">
            Donation Received
          </div>

          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">
            Thank You For Fueling P3
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-zinc-300 sm:text-base">
            Welcome to the founding community. Your support helps us ship faster, strengthen trust
            infrastructure, and bring real lending and crypto workflows to production for donors
            and investors.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-800 bg-black/40 p-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-[#00e599]">
                Next Steps For Donors
              </h2>
              <ol className="mt-3 space-y-2 text-sm text-zinc-300">
                <li>1. Watch progress updates in the platform and product roadmap.</li>
                <li>2. Join upcoming milestones and launches from the investor deck.</li>
                <li>3. Reach out directly if you want to contribute strategic support.</li>
              </ol>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-black/40 p-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-cyan-300">
                Next Steps For Investors
              </h2>
              <ol className="mt-3 space-y-2 text-sm text-zinc-300">
                <li>1. Book a private founder call.</li>
                <li>2. Review the latest pitch deck and operating assumptions.</li>
                <li>3. Coordinate diligence and participation terms with the team.</li>
              </ol>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <a
              href={CALENDLY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-lg bg-[#00e599] px-5 py-2 text-sm font-bold text-black transition-all hover:bg-[#00cc88]"
            >
              Schedule Investor Call
            </a>
            <Button variant="secondary" size="sm" onClick={onViewPitchDeck}>
              View Pitch Deck
            </Button>
            <Button variant="ghost" size="sm" onClick={onContinue}>
              Continue To Platform
            </Button>
          </div>

          <div className="mt-8 rounded-xl border border-zinc-800 bg-black/30 p-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">
              Contact
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {CONTACT_LINKS.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  target={item.href.startsWith('http') ? '_blank' : undefined}
                  rel={item.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition-all hover:border-zinc-500 hover:text-[#00e599]"
                >
                  {item.label}
                </a>
              ))}
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              admin@p3lending.space • +1 (402) 838-0848
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
