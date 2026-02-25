import React from 'react';
import { Footer } from './Footer';
import { LegalDocType } from './LegalModal';

export const PrivacyPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#050505] text-zinc-200 flex flex-col">
      <div className="max-w-3xl mx-auto px-6 py-12 flex-1">
        <a href="/" className="text-[11px] text-zinc-500 hover:text-[#00e599] transition-colors mb-6 inline-block">← Back to Home</a>
        <p className="text-[10px] text-amber-500/90 mb-4">Draft — not legal advice.</p>
        <h1 className="text-2xl font-bold text-white mb-6">Privacy Policy</h1>
        <div className="space-y-4 text-[13px] text-zinc-400 leading-relaxed">
          <p>This page is a placeholder for the Privacy Policy. Full policy will be published here. Do not rely on this draft for any legal or contractual purpose.</p>
          <p>How we collect, use, and protect your information will be described in the final privacy policy.</p>
        </div>
      </div>
      <Footer onOpenLegal={(_t: LegalDocType) => {}} />
    </div>
  );
};
