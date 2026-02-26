import React, { useState, useCallback } from 'react';
import { LegalDocType } from './LegalModal';

const OFFICIAL_ONION_URL = 'http://lwsieqoy6x2tv3mrqlfu6pkjqtyirn2j4oq3hz6y4yy7iz7v4ctqu6qd.onion';
const OFFICIAL_CLEARNET_URL = 'https://p3lending.space';
const APPLE_APP_STORE_URL = 'https://testflight.apple.com/join/gMrr2QcP';

interface Props {
  onOpenLegal: (type: LegalDocType) => void;
}

export const Footer: React.FC<Props> = ({ onOpenLegal }) => {
  const [copied, setCopied] = useState(false);

  const handleCopyOnion = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(OFFICIAL_ONION_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, []);

  const handleOpenDeck = (e: React.MouseEvent) => {
    e.preventDefault();
    // Dispatch a custom event or manipulate the URL to trigger App.tsx logic
    const url = new URL(window.location.href);
    url.searchParams.set('deck', 'true');
    window.location.href = url.toString();
  };

  return (
    <footer className="w-full border-t border-zinc-900 bg-black/80 backdrop-blur-md pt-12 pb-8 px-6 mt-auto z-10 relative">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          
          <div className="col-span-1 md:col-span-2 space-y-4">
             <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-zinc-900 rounded-lg border border-zinc-800 flex items-center justify-center">
                  <span className="font-bold text-white text-lg">P</span>
                  <span className="text-[#00e599] text-[10px] font-bold absolute -mt-3 -mr-3">3</span>
                </div>
                <span className="text-zinc-500 text-xs uppercase tracking-widest font-bold">Protocol Compliance</span>
             </div>
             <p className="text-[10px] text-zinc-500 leading-relaxed max-w-md">
               P3 Securities is a decentralized technology platform, not a bank or depository institution. 
               Loans are originated directly between peers via smart contracts. 
               <strong>Loans are not FDIC insured.</strong> Crypto assets are highly volatile. 
               Participation involves significant risk, including potential loss of principal.
             </p>
             <div className="flex gap-4">
                <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Equal_Housing_Lender_logo.svg/1200px-Equal_Housing_Lender_logo.svg.png" alt="EHL" className="h-8 opacity-20 grayscale hover:grayscale-0 transition-all" />
             </div>
          </div>

          <div>
             <h4 className="text-[10px] font-bold text-white uppercase tracking-wider mb-4">Legal</h4>
             <ul className="space-y-3 text-[11px] text-zinc-500 font-medium">
                <li><button onClick={() => onOpenLegal('ESIGN')} className="hover:text-[#00e599] transition-colors">E-Sign Consent</button></li>
                <li><button onClick={() => onOpenLegal('DISCLOSURES')} className="hover:text-[#00e599] transition-colors">State Disclosures</button></li>
             </ul>
          </div>

          <div>
             <h4 className="text-[10px] font-bold text-white uppercase tracking-wider mb-4">Resources</h4>
             <ul className="space-y-3 text-[11px] text-zinc-500 font-medium">
                <li><button onClick={() => onOpenLegal('ECOA')} className="hover:text-[#00e599] transition-colors">Fair Lending (ECOA)</button></li>
                <li><button onClick={() => onOpenLegal('SECURITY')} className="hover:text-[#00e599] transition-colors">Responsible Security</button></li>
                <li><button onClick={() => onOpenLegal('SUPPORT')} className="hover:text-[#00e599] transition-colors">Support & Safety</button></li>
                <li><button onClick={() => onOpenLegal('SATOSHI_WHITEPAPER')} className="hover:text-[#00e599] transition-colors">Bitcoin White Paper (Simplified)</button></li>
                <li><a href="#" onClick={handleOpenDeck} className="hover:text-[#00e599] transition-colors">Investor Pitch Deck</a></li>
                <li><a href="https://github.com/Mattjhagen/P3-Lending-Protocol/blob/main/Go-to-Markey-Strategy.MD" target="_blank" rel="noopener noreferrer" className="hover:text-[#00e599] transition-colors">For Investors</a></li>
                <li><a href="/sitemap.xml" target="_blank" rel="noopener noreferrer" className="hover:text-[#00e599] transition-colors">Sitemap.xml</a></li>
                <li><a href="/status" className="hover:text-[#00e599] transition-colors">System Status</a></li>
             </ul>
          </div>
        </div>

        {/* Legal & Disclosures */}
        <div className="pt-6 mt-6 border-t border-zinc-800/80">
          <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">Legal & Disclosures</h4>
          <ul className="space-y-1.5 text-[11px] text-zinc-500 mb-3">
            <li><a href="/terms" className="hover:text-[#00e599] transition-colors">Terms of Service</a></li>
            <li><a href="/privacy" className="hover:text-[#00e599] transition-colors">Privacy Policy</a></li>
            <li><a href="/risk" className="hover:text-[#00e599] transition-colors">Risk Disclosures</a></li>
            <li><a href="/marketplace" className="hover:text-[#00e599] transition-colors">Marketplace Disclaimer</a></li>
            <li><a href="/beta" className="hover:text-[#00e599] transition-colors">Beta Notice</a></li>
          </ul>
          <p className="text-[9px] text-zinc-600 leading-snug">Not a bank / Not FDIC insured.</p>
          <p className="text-[9px] text-zinc-600 leading-snug mt-1">Beta / MVP demo — no public lending or custody. For evaluation only.</p>
        </div>

        {/* Verify Official Access */}
        <div className="pt-6 mt-6 border-t border-zinc-800/80">
          <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Verify Official Access</h4>
          <div className="space-y-2 mb-1.5">
            <div>
              <a
                href={OFFICIAL_CLEARNET_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-zinc-400 hover:text-[#00e599] break-all"
              >
                Official clearnet: {OFFICIAL_CLEARNET_URL}
              </a>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={OFFICIAL_ONION_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-zinc-400 hover:text-[#00e599] break-all font-mono"
              >
                Official onion: {OFFICIAL_ONION_URL}
              </a>
              <button
                type="button"
                onClick={handleCopyOnion}
                className="shrink-0 text-[10px] px-2 py-1 rounded border border-zinc-700 text-zinc-500 hover:border-zinc-600 hover:text-zinc-400 transition-colors"
                aria-label="Copy onion address"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
          <p className="text-[9px] text-zinc-600 leading-snug max-w-xl">
            Verify this onion address matches p3lending.space and our GitHub to avoid phishing clones.
          </p>
        </div>

        {/* Download on the App Store */}
        <div className="pt-6 mt-6 border-t border-zinc-800/80">
          <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Get the app</h4>
          <a
            href={APPLE_APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center opacity-90 hover:opacity-100 transition-opacity"
            aria-label="Download P3 Lending on the App Store"
          >
            <img
              src="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg"
              alt="Download on the App Store"
              className="h-10 w-auto"
              width={120}
              height={40}
            />
          </a>
        </div>

        <div className="pt-8 border-t border-zinc-900 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] text-zinc-600">
           <span>© 2024 P3 Securities. All rights reserved.</span>
           <div className="flex flex-wrap items-center justify-center gap-4">
             <span>NMLS ID: 123456 (Pending)</span>
             <span>v2.4.0-beta</span>
             <a
               href="https://app.netlify.com/projects/p3-lending-protocol/deploys"
               target="_blank"
               rel="noopener noreferrer"
               className="inline-flex items-center"
             >
               <img
                 src="https://api.netlify.com/api/v1/badges/ebfbace1-b5fa-40d8-baa9-f631ff3dcf89/deploy-status"
                 alt="Netlify deploy status"
                 className="h-5 w-auto"
               />
             </a>
           </div>
        </div>
      </div>
    </footer>
  );
};
