import React from 'react';
import { Footer } from './Footer';
import { LegalDocType } from './LegalModal';

const LAST_UPDATED = new Date().toISOString().split('T')[0];

export const MarketplacePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#050505] text-zinc-200 flex flex-col">
      <div className="max-w-3xl mx-auto px-6 py-12 flex-1">
        <a href="/" className="text-[11px] text-zinc-500 hover:text-[#00e599] transition-colors mb-6 inline-block">← Back to Home</a>
        <p className="text-[10px] text-zinc-500 mb-1">Last updated: {LAST_UPDATED}</p>
        <p className="text-[10px] text-amber-500/90 mb-4">Draft for MVP / informational only — not legal advice.</p>
        <h1 className="text-2xl font-bold text-white mb-6">Marketplace Disclaimer</h1>

        <section className="space-y-3 text-[13px] text-zinc-400 leading-relaxed mb-6">
          <h2 className="text-sm font-semibold text-zinc-300">Marketplace-only</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Lenders and borrowers contract directly with each other.</li>
            <li>P3 provides matching and reputation signals only.</li>
          </ul>
        </section>

        <section className="space-y-3 text-[13px] text-zinc-400 leading-relaxed mb-6">
          <h2 className="text-sm font-semibold text-zinc-300">What P3 is not</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>P3 is not a bank, not a lender, and not a broker-dealer.</li>
            <li>P3 does not provide financial, tax, or legal advice.</li>
          </ul>
        </section>
      </div>
      <Footer onOpenLegal={(_t: LegalDocType) => {}} />
    </div>
  );
};
