import React from 'react';
import { Footer } from './Footer';
import { LegalDocType } from './LegalModal';

const LAST_UPDATED = new Date().toISOString().split('T')[0];

export const TermsPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#050505] text-zinc-200 flex flex-col">
      <div className="max-w-3xl mx-auto px-6 py-12 flex-1">
        <a href="/" className="text-[11px] text-zinc-500 hover:text-[#00e599] transition-colors mb-6 inline-block">← Back to Home</a>
        <p className="text-[10px] text-zinc-500 mb-1">Last updated: {LAST_UPDATED}</p>
        <p className="text-[10px] text-amber-500/90 mb-4">Draft for MVP / informational only — not legal advice.</p>
        <h1 className="text-2xl font-bold text-white mb-6">Terms of Service</h1>

        <section className="space-y-3 text-[13px] text-zinc-400 leading-relaxed mb-6">
          <h2 className="text-sm font-semibold text-zinc-300">Platform role</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>P3 is a technology platform and does not originate, fund, or guarantee loans.</li>
            <li>No custody: P3 does not hold customer funds (for MVP).</li>
            <li>Users are responsible for compliance with their local laws.</li>
          </ul>
        </section>

        <section className="space-y-3 text-[13px] text-zinc-400 leading-relaxed mb-6">
          <h2 className="text-sm font-semibold text-zinc-300">Limitation of liability &amp; warranties</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>To the extent permitted by law, P3 disclaims all warranties (express or implied).</li>
            <li>Liability is limited to the maximum extent permitted under applicable law.</li>
          </ul>
        </section>

        <p className="text-[12px] text-zinc-500">Contact: <a href="mailto:support@p3lending.space" className="text-[#00e599] hover:underline">support@p3lending.space</a></p>
      </div>
      <Footer onOpenLegal={(_t: LegalDocType) => {}} />
    </div>
  );
};
