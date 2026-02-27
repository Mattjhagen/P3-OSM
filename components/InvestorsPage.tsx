import React from 'react';
import { Footer } from './Footer';
import { LegalDocType } from './LegalModal';

export const InvestorsPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#050505] text-zinc-200 flex flex-col">
      <div className="max-w-4xl mx-auto px-6 py-12 flex-1">
        <a href="/" className="text-[11px] text-zinc-500 hover:text-[#00e599] transition-colors mb-6 inline-block">
          ← Back to Home
        </a>
        <h1 className="text-2xl font-bold text-white mb-2">Investor Go-to-Market Strategy</h1>
        <p className="text-[12px] text-zinc-500 mb-8">
          This public page summarizes the strategy currently documented in <code>Go-to-Markey-Strategy.MD</code>.
        </p>

        <section className="space-y-3 text-[13px] text-zinc-400 leading-relaxed mb-8">
          <h2 className="text-sm font-semibold text-zinc-300">Thesis</h2>
          <p>
            P3 is positioned as a blockchain-enabled lending protocol focused on migrants, refugees, and other
            credit-invisible communities. The strategy frames a large market opportunity across unbanked populations,
            alternative lending, and DeFi adoption.
          </p>
        </section>

        <section className="space-y-3 text-[13px] text-zinc-400 leading-relaxed mb-8">
          <h2 className="text-sm font-semibold text-zinc-300">Key market case</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Large underserved TAM (unbanked and credit-invisible users globally and in the U.S.).</li>
            <li>Strong growth projections for alternative lending and DeFi markets.</li>
            <li>Double-bottom-line positioning: financial upside plus measurable social impact.</li>
          </ul>
        </section>

        <section className="space-y-3 text-[13px] text-zinc-400 leading-relaxed mb-8">
          <h2 className="text-sm font-semibold text-zinc-300">Lessons from precedent protocols</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Goldfinch defaults are used as cautionary examples for underwriting rigor, covenant enforcement, and
              off-chain recovery complexity.
            </li>
            <li>
              Centrifuge is highlighted as a model for tokenizing real-world assets and building risk-tranched capital
              structures.
            </li>
          </ul>
        </section>

        <section className="space-y-3 text-[13px] text-zinc-400 leading-relaxed mb-8">
          <h2 className="text-sm font-semibold text-zinc-300">Recommended GTM + product strategy</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Hybrid underwriting model with professional delegates plus transparent on-chain controls.</li>
            <li>AI/alternative-data credit signals (utility, payments, behavioral and social context).</li>
            <li>Social collateral and vouching mechanisms for thin-file users.</li>
            <li>Two-layer default protection (first-loss capital + pooled cover).</li>
            <li>Distribution partnerships with local operators/fintechs for real user acquisition.</li>
          </ul>
        </section>

        <section className="space-y-3 text-[13px] text-zinc-400 leading-relaxed mb-8">
          <h2 className="text-sm font-semibold text-zinc-300">Security and architecture priorities</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Audited contracts, defense-in-depth, and proactive vulnerability testing.</li>
            <li>Oracle resilience via multi-source data, staleness checks, deviation bounds, and circuit breakers.</li>
            <li>Modular code, gas-aware design, and clear observability of risk controls.</li>
          </ul>
        </section>

        <section className="space-y-3 text-[13px] text-zinc-400 leading-relaxed mb-8">
          <h2 className="text-sm font-semibold text-zinc-300">Regulatory and legal positioning</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Proactive compliance posture across AML/illicit finance controls and sanctions screening.</li>
            <li>Explicit awareness of SEC/CFTC/OFAC and developer-liability precedent risks.</li>
            <li>U.S. legal enforceability strategy for digital collateral under UCC Article 12 concepts.</li>
            <li>EU readiness for automated decisioning obligations (including contestability and review paths).</li>
          </ul>
        </section>

        <section className="space-y-3 text-[13px] text-zinc-400 leading-relaxed">
          <h2 className="text-sm font-semibold text-zinc-300">Executive focus areas before VC outreach</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Quantify TAM and near-term beachhead with credible acquisition assumptions.</li>
            <li>Demonstrate robust underwriting + default playbook with measurable safeguards.</li>
            <li>Present partnership-led distribution plan with regulatory-safe rollout sequencing.</li>
            <li>Show audit readiness, governance discipline, and operational risk controls.</li>
          </ul>
        </section>
      </div>
      <Footer onOpenLegal={(_t: LegalDocType) => {}} />
    </div>
  );
};

