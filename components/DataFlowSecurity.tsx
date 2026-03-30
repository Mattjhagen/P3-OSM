import React, { useEffect } from 'react';
import { Footer } from './Footer';
import { LegalDocType } from './LegalModal';

const LAST_UPDATED = new Date().toISOString().split('T')[0];

export const DataFlowSecurity: React.FC = () => {
  useEffect(() => {
    document.title = 'P3 Public Beta Data Flow & Security';
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', 'Documentation of P3 public beta data handling, trust scoring flow, and security controls.');
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-200 flex flex-col">
      <div className="max-w-4xl mx-auto px-6 py-12 flex-1">
        <a href="/" className="text-[11px] text-zinc-500 hover:text-[#00e599] transition-colors mb-6 inline-block">← Back to Home</a>
        <p className="text-[10px] text-zinc-500 mb-1">Last updated: {LAST_UPDATED}</p>
        <p className="text-[10px] text-zinc-500 mb-4 tracking-wider uppercase font-bold">P3 Public Beta</p>
        
        <h1 className="text-3xl font-bold text-white mb-4 tracking-tight">P3 Public Beta Data Flow & Security</h1>
        <p className="text-sm text-zinc-400 mb-12 leading-relaxed max-w-2xl">
          This page documents how user and lead data moves through the P3 public beta environment, how scoring is generated, where information is stored, and what controls are in place to support auditability, security, and legal review.
        </p>

        <div className="space-y-16">
          {/* Section 1 */}
          <section id="system-overview">
            <h2 className="text-lg font-bold text-white mb-6 border-b border-zinc-800 pb-2">SECTION 1 — System Overview</h2>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[13px] text-zinc-400">
              <li className="flex items-start gap-2 flex-wrap"><span className="text-zinc-200 font-semibold min-w-[150px]">Frontend:</span> React / public web app</li>
              <li className="flex items-start gap-2 flex-wrap"><span className="text-zinc-200 font-semibold min-w-[150px]">Backend:</span> Node.js / Express</li>
              <li className="flex items-start gap-2 flex-wrap"><span className="text-zinc-200 font-semibold min-w-[150px]">Database and Auth:</span> Supabase</li>
              <li className="flex items-start gap-2 flex-wrap"><span className="text-zinc-200 font-semibold min-w-[150px]">Blockchain Layer:</span> Ethereum hash anchoring</li>
              <li className="flex items-start gap-2 flex-wrap"><span className="text-zinc-200 font-semibold min-w-[150px]">Public APIs:</span> reputation and loan endpoints</li>
              <li className="flex items-start gap-2 flex-wrap"><span className="text-zinc-200 font-semibold min-w-[150px]">OAuth providers:</span> Google and Apple with PKCE</li>
            </ul>
          </section>

          {/* Section 2 */}
          <section id="data-flow">
            <h2 className="text-lg font-bold text-white mb-8 border-b border-zinc-800 pb-2">SECTION 2 — End-to-End Data Flow</h2>
            <div className="space-y-10">
              <div>
                <h3 className="text-sm font-bold text-[#00e599] mb-3 uppercase tracking-wide">1. Lead Capture</h3>
                <ul className="list-disc pl-5 text-[13px] text-zinc-400 space-y-2">
                  <li>User lands on site.</li>
                  <li>Lead data may include name, email, phone, IP/device metadata.</li>
                  <li>Data enters frontend and is submitted securely to backend / Supabase.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-bold text-[#00e599] mb-3 uppercase tracking-wide">2. Authentication</h3>
                <ul className="list-disc pl-5 text-[13px] text-zinc-400 space-y-2">
                  <li>Authentication handled through Supabase Auth.</li>
                  <li>OAuth via Google/Apple with PKCE.</li>
                  <li>Verified identity tied to internal user ID.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-bold text-[#00e599] mb-3 uppercase tracking-wide">3. Profile and Identity Data</h3>
                <ul className="list-disc pl-5 text-[13px] text-zinc-400 space-y-2">
                  <li>User profile data stored in controlled tables.</li>
                  <li>Wallet address may optionally be attached.</li>
                  <li>JWT/session tokens validated server-side before protected actions.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-bold text-[#00e599] mb-3 uppercase tracking-wide">4. Event / Trust Signal Collection</h3>
                <ul className="list-disc pl-5 text-[13px] text-zinc-400 space-y-2">
                  <li>Behavioral and system events are collected as trust signals.</li>
                  <li>Critical events should be server-generated where possible.</li>
                  <li>Events are stored in append-oriented logs for traceability.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-bold text-[#00e599] mb-3 uppercase tracking-wide">5. Trust Score Computation</h3>
                <ul className="list-disc pl-5 text-[13px] text-zinc-400 space-y-2">
                  <li>Backend scoring module computes score, risk tier, model version, timestamp, and feature hash.</li>
                  <li>Scoring should be deterministic and versioned.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-bold text-[#00e599] mb-3 uppercase tracking-wide">6. Trust Snapshot Storage</h3>
                <ul className="list-disc pl-5 text-[13px] text-zinc-400 space-y-2">
                  <li>Snapshot written to database with score metadata.</li>
                  <li>Snapshot includes feature_vector_hash and model_version.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-bold text-[#00e599] mb-3 uppercase tracking-wide">7. Blockchain Hash Anchoring</h3>
                <div className="text-[13px] text-zinc-400 space-y-4">
                  <p>A deterministic snapshot string is hashed and anchored on Ethereum for tamper detection and audit verification.</p>
                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Canonical hash input format:</p>
                  <pre className="bg-[#0a0a0a] border border-zinc-800 rounded-xl p-4 text-[#00e599] font-mono text-xs overflow-x-auto shadow-inner">
                    [user_id|score|risk_tier|snapshot_time|model_version|feature_vector_hash]
                  </pre>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-[#00e599] mb-3 uppercase tracking-wide">8. Loan Request Decisioning</h3>
                <ul className="list-disc pl-5 text-[13px] text-zinc-400 space-y-2">
                  <li>Loan request flow checks current trust snapshot.</li>
                  <li>Hash can be compared against on-chain record.</li>
                  <li>Risk policy can reject stale, invalid, or mismatched trust data.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-bold text-[#00e599] mb-3 uppercase tracking-wide">9. B2B / API Access</h3>
                <ul className="list-disc pl-5 text-[13px] text-zinc-400 space-y-2">
                  <li>External clients access scoped endpoints with API keys.</li>
                  <li>API usage is logged; access is rate limited and audited.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section id="security-controls">
            <h2 className="text-lg font-bold text-white mb-8 border-b border-zinc-800 pb-2">SECTION 3 — Security Controls</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div>
                <h3 className="text-sm font-bold text-zinc-300 mb-4 flex items-center gap-2">
                  <span className="w-1 h-4 bg-[#00e599] rounded-full"></span>
                  Data Classification
                </h3>
                <div className="space-y-3 text-[13px] text-zinc-400">
                  <div className="flex justify-between border-b border-zinc-900 pb-2"><span>PII</span> <span className="text-zinc-500">name, email, phone</span></div>
                  <div className="flex justify-between border-b border-zinc-900 pb-2"><span>Behavioral data</span> <span className="text-zinc-500">trust-related events</span></div>
                  <div className="flex justify-between border-b border-zinc-900 pb-2"><span>Derived data</span> <span className="text-zinc-500">trust score, risk tier</span></div>
                  <div className="flex justify-between border-b border-zinc-900 pb-2"><span>Integrity proof</span> <span className="text-zinc-500 font-mono">on-chain hash only</span></div>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-300 mb-4 flex items-center gap-2">
                   <span className="w-1 h-4 bg-[#00e599] rounded-full"></span>
                   Core Controls
                </h3>
                <ul className="list-disc pl-5 text-[13px] text-zinc-400 space-y-1.5">
                  <li>TLS in transit.</li>
                  <li>Encryption at rest via platform infrastructure.</li>
                  <li>Environment-based secret management.</li>
                  <li>RBAC / scoped access.</li>
                  <li>Supabase RLS where applicable.</li>
                  <li>Audit logging for sensitive actions.</li>
                  <li>Deterministic verification of trust snapshots.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 4 */}
          <section id="auditability" className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl p-8 shadow-lg">
            <h2 className="text-xs font-bold text-[#00e599] mb-3 uppercase tracking-[0.2em]">Auditability</h2>
            <p className="text-sm text-zinc-300 italic leading-relaxed font-medium">
              "Every trust score should be traceable from ingestion → event log → scoring → stored snapshot → blockchain anchor → verification step."
            </p>
          </section>

          {/* Section 5 */}
          <section id="recommended-records">
            <h2 className="text-sm font-bold text-zinc-200 mb-4 uppercase tracking-widest">Recommended Audit Records</h2>
            <div className="flex flex-wrap gap-2">
              {['audit_events', 'api_key_usage', 'api_audit_logs', 'trust_snapshots', 'user_consents', 'retention documentation', 'model versions'].map(tag => (
                <span key={tag} className="px-3 py-1 bg-zinc-900 border border-zinc-800 text-zinc-500 rounded-md font-mono text-[11px]">{tag}</span>
              ))}
            </div>
          </section>

          {/* Section 6 */}
          <section id="hardening">
            <h2 className="text-lg font-bold text-white mb-6 border-b border-zinc-800 pb-2">SECTION 6 — Still Being Tightened</h2>
            <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-6">
              <h3 className="text-xs font-bold text-amber-500 mb-4 uppercase tracking-widest">Still Being Tightened / In Progress</h3>
              <ul className="list-disc pl-5 text-[13px] text-zinc-400 space-y-2">
                <li>Retention policy formalization.</li>
                <li>Consent/version tracking.</li>
                <li>Model governance and explainability.</li>
                <li>Server-side generation for high-trust events.</li>
                <li>Legal/compliance review before broader release.</li>
              </ul>
            </div>
          </section>

          {/* Section 7 */}
          <section id="architecture">
            <h2 className="text-lg font-bold text-white mb-8 border-b border-zinc-800 pb-2">SECTION 7 — Simple Architecture Diagram</h2>
            <div className="bg-[#050505] border border-zinc-900 rounded-3xl p-10 flex flex-col items-center space-y-1.5 font-mono text-[10px] text-zinc-300">
              <div className="px-5 py-2 border border-zinc-800 bg-zinc-900/40 rounded-lg w-48 text-center">[User]</div>
              <div className="text-zinc-700">↓</div>
              <div className="px-5 py-2 border border-zinc-800 bg-zinc-900/40 rounded-lg w-48 text-center font-bold text-white">[Frontend]</div>
              <div className="text-zinc-700">↓</div>
              <div className="px-5 py-2 border border-zinc-800 bg-zinc-900/40 rounded-lg w-48 text-center">[Auth / Supabase]</div>
              <div className="text-zinc-700">↓</div>
              <div className="px-5 py-2 border border-[#00e599]/30 bg-[#00e599]/5 rounded-lg w-48 text-center text-[#00e599] font-bold">[Backend API]</div>
              <div className="text-zinc-700">↓</div>
              <div className="px-5 py-2 border border-zinc-800 bg-zinc-900/40 rounded-lg w-48 text-center">[Event Store]</div>
              <div className="text-zinc-700">↓</div>
              <div className="px-5 py-2 border border-zinc-800 bg-zinc-900/40 rounded-lg w-48 text-center">[Scoring Engine]</div>
              <div className="text-zinc-700">↓</div>
              <div className="px-5 py-2 border border-zinc-800 bg-zinc-900/40 rounded-lg w-48 text-center text-zinc-200">[Trust Snapshot DB]</div>
              <div className="text-zinc-700">↓</div>
              <div className="px-5 py-2 border border-amber-500/30 bg-amber-500/5 rounded-lg w-48 text-center text-amber-500 font-bold">[Blockchain Hash Anchor]</div>
              <div className="text-zinc-700">↓</div>
              <div className="px-5 py-2 border border-zinc-800 bg-zinc-900/40 rounded-lg w-48 text-center">[Decision Layer]</div>
            </div>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t border-zinc-800 text-[12px] text-zinc-500 flex flex-col md:flex-row justify-between items-start gap-4">
          <p>For detailed inquiries or security audits, contact <a href="mailto:support@p3lending.space" className="text-[#00e599] hover:underline">support@p3lending.space</a></p>
          <div className="flex gap-4">
            <a href="/privacy" className="hover:text-white underline underline-offset-2 decoration-zinc-800">Privacy Policy</a>
            <a href="/terms" className="hover:text-white underline underline-offset-2 decoration-zinc-800">Terms of Service</a>
          </div>
        </div>
      </div>
      <Footer onOpenLegal={(_t: LegalDocType) => {}} />
    </div>
  );
};
