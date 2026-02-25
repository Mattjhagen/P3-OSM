import React from 'react';
import { Footer } from './Footer';
import { LegalDocType } from './LegalModal';

export const RiskPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#050505] text-zinc-200 flex flex-col">
      <div className="max-w-3xl mx-auto px-6 py-12 flex-1">
        <a href="/" className="text-[11px] text-zinc-500 hover:text-[#00e599] transition-colors mb-6 inline-block">← Back to Home</a>
        <p className="text-[10px] text-amber-500/90 mb-4">Draft — not legal advice.</p>
        <h1 className="text-2xl font-bold text-white mb-6">Risk Disclosures</h1>
        <div className="space-y-4 text-[13px] text-zinc-400 leading-relaxed">
          <p>This page is a placeholder for Risk Disclosures. Full risk disclosures will be published here. Do not rely on this draft for any legal or investment purpose.</p>
          <p>Lending, borrowing, and use of crypto assets involve significant risk. Final disclosures will outline these risks in detail.</p>
        </div>
      </div>
      <Footer onOpenLegal={(_t: LegalDocType) => {}} />
    </div>
  );
};
