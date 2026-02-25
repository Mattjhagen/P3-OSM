import React from 'react';
import { Footer } from './Footer';
import { LegalDocType } from './LegalModal';

const LAST_UPDATED = new Date().toISOString().split('T')[0];

export const PrivacyPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#050505] text-zinc-200 flex flex-col">
      <div className="max-w-3xl mx-auto px-6 py-12 flex-1">
        <a href="/" className="text-[11px] text-zinc-500 hover:text-[#00e599] transition-colors mb-6 inline-block">← Back to Home</a>
        <p className="text-[10px] text-zinc-500 mb-1">Last updated: {LAST_UPDATED}</p>
        <p className="text-[10px] text-amber-500/90 mb-4">Draft for MVP / informational only — not legal advice.</p>
        <h1 className="text-2xl font-bold text-white mb-6">Privacy Policy</h1>

        <section className="space-y-3 text-[13px] text-zinc-400 leading-relaxed mb-6">
          <h2 className="text-sm font-semibold text-zinc-300">What we collect</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Account information (e.g. email, profile data you provide).</li>
            <li>Device and browser information (e.g. for security and compatibility).</li>
            <li>Usage and analytics data to improve the product.</li>
          </ul>
        </section>

        <section className="space-y-3 text-[13px] text-zinc-400 leading-relaxed mb-6">
          <h2 className="text-sm font-semibold text-zinc-300">Why we use it</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Security, fraud prevention, and product improvement.</li>
          </ul>
        </section>

        <section className="space-y-3 text-[13px] text-zinc-400 leading-relaxed mb-6">
          <h2 className="text-sm font-semibold text-zinc-300">Data sharing</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>We may share data with service providers necessary to operate the platform.</li>
          </ul>
        </section>

        <section className="space-y-3 text-[13px] text-zinc-400 leading-relaxed mb-6">
          <h2 className="text-sm font-semibold text-zinc-300">Data retention</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>We retain data as needed for the purposes above and as required by law.</li>
          </ul>
        </section>

        <p className="text-[12px] text-zinc-500">Privacy requests: <a href="mailto:support@p3lending.space" className="text-[#00e599] hover:underline">support@p3lending.space</a></p>
      </div>
      <Footer onOpenLegal={(_t: LegalDocType) => {}} />
    </div>
  );
};
