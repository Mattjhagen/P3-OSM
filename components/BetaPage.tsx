import React from 'react';
import { Footer } from './Footer';
import { LegalDocType } from './LegalModal';

const LAST_UPDATED = new Date().toISOString().split('T')[0];

export const BetaPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#050505] text-zinc-200 flex flex-col">
      <div className="max-w-3xl mx-auto px-6 py-12 flex-1">
        <a href="/" className="text-[11px] text-zinc-500 hover:text-[#00e599] transition-colors mb-6 inline-block">← Back to Home</a>
        <p className="text-[10px] text-zinc-500 mb-1">Last updated: {LAST_UPDATED}</p>
        <p className="text-[10px] text-amber-500/90 mb-4">Draft for MVP / informational only — not legal advice.</p>
        <h1 className="text-2xl font-bold text-white mb-6">Beta Notice</h1>

        <section className="space-y-3 text-[13px] text-zinc-400 leading-relaxed mb-6">
          <h2 className="text-sm font-semibold text-zinc-300">MVP beta</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>This is an MVP beta: features may change and bugs may exist.</li>
            <li>Not available for public lending / no active loan origination (MVP).</li>
            <li>Use at your own risk; do not rely on availability or continuity of service.</li>
          </ul>
        </section>

        <section className="space-y-3 text-[13px] text-zinc-400 leading-relaxed mb-6">
          <h2 className="text-sm font-semibold text-zinc-300">Report issues</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>To report issues, contact <a href="mailto:support@p3lending.space" className="text-[#00e599] hover:underline">support@p3lending.space</a>.</li>
          </ul>
        </section>
      </div>
      <Footer onOpenLegal={(_t: LegalDocType) => {}} />
    </div>
  );
};
