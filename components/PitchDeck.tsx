
import React, { useState, useEffect } from 'react';
import { Logo } from './Logo';
import { Button } from './Button';
import { ScoreGauge } from './ScoreGauge';
import { PaymentService } from '../services/paymentService';

interface Props {
  onClose: () => void;
}

const CALENDLY_MEETING_URL = 'https://calendly.com/admin-p3lending/new-meeting';
const GO_TO_MARKET_STRATEGY_URL = 'https://github.com/Mattjhagen/P3-Lending-Protocol/blob/main/Go-to-Markey-Strategy.MD';

interface DonationCheckoutButtonProps {
  className: string;
  source: string;
  children: React.ReactNode;
}

const DonationCheckoutButton: React.FC<DonationCheckoutButtonProps> = ({
  className,
  source,
  children,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [amountUsd, setAmountUsd] = useState('25');
  const [donorEmail, setDonorEmail] = useState('');
  const [donorName, setDonorName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const closeModal = () => {
    if (isSubmitting) return;
    setIsModalOpen(false);
    setError('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    const parsedAmount = Number.parseFloat(amountUsd);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 1) {
      setError('Enter a valid donation amount of at least $1.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await PaymentService.createDonationCheckoutSession({
        amountUsd: parsedAmount,
        donorEmail: donorEmail.trim() || undefined,
        donorName: donorName.trim() || undefined,
        source,
      });
      window.location.assign(response.checkoutUrl);
    } catch (submitError: any) {
      setIsSubmitting(false);
      setError(submitError?.message || 'Unable to start checkout. Please try again.');
    }
  };

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          setError('');
          setIsModalOpen(true);
        }}
      >
        {children}
      </button>
      {isModalOpen && (
        <div
          className="fixed inset-0 z-[10000] bg-black/80 px-4 py-6 flex items-center justify-center"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-zinc-700 bg-[#090909] p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-white">Support P3 Lending</h3>
            <p className="mt-1 text-sm text-zinc-400">
              Complete a secure donation through Stripe Checkout.
            </p>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {[25, 100, 500].map((presetAmount) => (
                <button
                  key={presetAmount}
                  type="button"
                  onClick={() => setAmountUsd(String(presetAmount))}
                  className={`rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
                    amountUsd === String(presetAmount)
                      ? 'border-[#00e599] bg-[#00e599]/10 text-[#00e599]'
                      : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500'
                  }`}
                >
                  ${presetAmount}
                </button>
              ))}
            </div>

            <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Donation Amount (USD)
                </span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="decimal"
                  value={amountUsd}
                  onChange={(event) => setAmountUsd(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white outline-none focus:border-[#00e599]"
                  placeholder="25"
                  required
                />
              </label>

              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Name (Optional)
                </span>
                <input
                  type="text"
                  value={donorName}
                  onChange={(event) => setDonorName(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white outline-none focus:border-[#00e599]"
                  placeholder="Your name"
                  maxLength={120}
                />
              </label>

              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Email For Receipt (Optional)
                </span>
                <input
                  type="email"
                  value={donorEmail}
                  onChange={(event) => setDonorEmail(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white outline-none focus:border-[#00e599]"
                  placeholder="you@example.com"
                  maxLength={160}
                />
              </label>

              {error && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  {error}
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={closeModal} className="w-full sm:w-auto">
                  Cancel
                </Button>
                <Button type="submit" isLoading={isSubmitting} className="w-full sm:w-auto">
                  Continue To Checkout
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

const SLIDES = [
  {
    id: 'cover',
    render: () => (
      <div className="flex flex-col items-center justify-center h-full text-center space-y-8 animate-fade-in">
        <div className="transform scale-150 mb-8"><Logo /></div>
        <h1 className="text-4xl sm:text-5xl md:text-8xl font-bold tracking-tighter leading-none">
          Credit based on <br/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00e599] to-emerald-600">Character</span>.
        </h1>
        <p className="text-base sm:text-lg md:text-2xl text-zinc-400 font-light tracking-wide max-w-2xl">
          The first decentralized lending protocol powered by <br/> Social Underwriting & AI.
        </p>
        <div className="pt-12 text-sm text-zinc-600 font-mono uppercase tracking-widest animate-pulse">
          Swipe or tap arrows →
        </div>
      </div>
    )
  },
  {
    id: 'problem',
    render: () => (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center h-full px-4 sm:px-6 md:px-12">
        <div className="space-y-6">
          <div className="text-[#00e599] font-mono text-xl uppercase tracking-widest">The Problem</div>
          <h2 className="text-5xl font-bold text-white leading-tight">FICO is Broken.</h2>
          <p className="text-xl text-zinc-400 leading-relaxed">
            45 Million Americans are "credit invisible." Traditional banks rely on backward-looking data (payment history) that penalizes the young, the unbanked, and crypto-natives.
          </p>
          <ul className="space-y-4 text-lg text-zinc-300 pt-4">
            <li className="flex items-center gap-3"><span className="text-red-500">✕</span> Black Box Algorithms</li>
            <li className="flex items-center gap-3"><span className="text-red-500">✕</span> Ignores On-Chain Assets</li>
            <li className="flex items-center gap-3"><span className="text-red-500">✕</span> Zero Context on Defaults</li>
          </ul>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-12 flex items-center justify-center relative overflow-hidden">
           <div className="absolute inset-0 bg-red-500/5 blur-3xl"></div>
           <div className="text-center space-y-4 relative z-10">
             <div className="text-6xl font-mono text-red-500 font-bold opacity-50 line-through decoration-red-500">580</div>
             <div className="text-zinc-500 uppercase tracking-widest">Credit Denied</div>
           </div>
        </div>
      </div>
    )
  },
  {
    id: 'solution',
    render: () => (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center h-full px-4 sm:px-6 md:px-12">
        <div className="order-2 md:order-1 relative">
           <div className="absolute inset-0 bg-[#00e599]/10 blur-[100px] rounded-full"></div>
           <div className="glass-panel p-8 rounded-3xl border border-[#00e599]/30 relative z-10">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                   <div className="w-12 h-12 bg-black rounded-full border border-zinc-700"></div>
                   <div>
                     <div className="h-2 w-24 bg-zinc-700 rounded mb-1"></div>
                     <div className="h-2 w-16 bg-zinc-800 rounded"></div>
                   </div>
                </div>
                <div className="text-[#00e599] font-bold text-xl">85 Score</div>
              </div>
              <div className="space-y-3">
                 <div className="p-3 bg-zinc-900 rounded-lg flex justify-between items-center text-sm">
                    <span className="text-zinc-400">Repayment Streak</span>
                    <span className="text-white">12 Months 🔥</span>
                 </div>
                 <div className="p-3 bg-zinc-900 rounded-lg flex justify-between items-center text-sm">
                    <span className="text-zinc-400">Community Trust</span>
                    <span className="text-white">Verified 🛡️</span>
                 </div>
              </div>
           </div>
        </div>
        <div className="space-y-6 order-1 md:order-2">
          <div className="text-[#00e599] font-mono text-xl uppercase tracking-widest">The Solution</div>
          <h2 className="text-5xl font-bold text-white leading-tight">Social Underwriting.</h2>
          <p className="text-xl text-zinc-400 leading-relaxed">
            P3 reintroduces the "village" to finance. We use AI to quantify social capital, on-chain history, and character.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4">
             <div>
               <h4 className="text-white font-bold text-lg">Behavioral</h4>
               <p className="text-sm text-zinc-500">We value repayment consistency over total net worth.</p>
             </div>
             <div>
               <h4 className="text-white font-bold text-lg">Contextual</h4>
               <p className="text-sm text-zinc-500">AI analyzes the "why" behind your financial history.</p>
             </div>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'tech',
    render: () => (
      <div className="flex flex-col items-center justify-center h-full px-4 sm:px-6 md:px-12 text-center">
        <div className="text-[#00e599] font-mono text-xl uppercase tracking-widest mb-6">The Technology</div>
        <h2 className="text-5xl font-bold text-white mb-12">Powered by Gemini AI & Ethereum</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-6xl">
           <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl hover:border-[#00e599]/50 transition-all group">
              <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">🧠</div>
              <h3 className="text-xl font-bold text-white mb-2">Gemini Analysis</h3>
              <p className="text-zinc-400 text-sm">LLM processing of natural language financial narratives and reputation data.</p>
           </div>
           <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl hover:border-[#00e599]/50 transition-all group">
              <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">⛓️</div>
              <h3 className="text-xl font-bold text-white mb-2">Smart Escrow</h3>
              <p className="text-zinc-400 text-sm">Trustless fund release. Lenders engage directly with borrowers via contract.</p>
           </div>
           <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl hover:border-[#00e599]/50 transition-all group">
              <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">⚖️</div>
              <h3 className="text-xl font-bold text-white mb-2">Risk Engine</h3>
              <p className="text-zinc-400 text-sm">Real-time macro-economic search grounding to adjust risk scores dynamically.</p>
           </div>
        </div>
      </div>
    )
  },
  {
    id: 'product',
    render: () => (
      <div className="h-full px-4 sm:px-6 md:px-12 flex flex-col justify-center">
        <div className="flex items-center gap-4 mb-8">
           <div className="text-[#00e599] font-mono text-xl uppercase tracking-widest">The Product</div>
           <div className="h-px bg-zinc-800 flex-1"></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
           <div className="lg:col-span-4 space-y-8">
              <h2 className="text-4xl font-bold text-white">A Complete Financial Ecosystem.</h2>
              <ul className="space-y-6">
                 <li className="bg-zinc-900 p-4 rounded-xl border-l-4 border-[#00e599]">
                    <strong className="block text-white text-lg">Borrower Dashboard</strong>
                    <span className="text-zinc-400 text-sm">Instant "Fresh Start" microloans and reputation tracking.</span>
                 </li>
                 <li className="bg-zinc-900 p-4 rounded-xl border-l-4 border-blue-500">
                    <strong className="block text-white text-lg">Lender Desk</strong>
                    <span className="text-zinc-400 text-sm">AI Matchmaking to deploy capital to high-quality peers.</span>
                 </li>
                 <li className="bg-zinc-900 p-4 rounded-xl border-l-4 border-purple-500">
                    <strong className="block text-white text-lg">Mentorship Hub</strong>
                    <span className="text-zinc-400 text-sm">Sponsor new users to earn yield + social badges.</span>
                 </li>
              </ul>
           </div>
           <div className="lg:col-span-8 relative">
              <div className="absolute inset-0 bg-[#00e599]/20 blur-3xl rounded-full opacity-20"></div>
              <img src="https://images.unsplash.com/photo-1642104704074-907c0698cbd9?q=80&w=2832&auto=format&fit=crop" className="rounded-2xl border border-zinc-700 shadow-2xl opacity-50 grayscale hover:grayscale-0 transition-all duration-700" alt="Dashboard Preview" />
              <div className="absolute bottom-2 left-2 md:bottom-[-20px] md:left-[-20px] bg-[#050505] p-4 md:p-6 rounded-2xl border border-zinc-800 shadow-xl">
                 <ScoreGauge score={88} />
              </div>
           </div>
        </div>
      </div>
    )
  },
  {
    id: 'market',
    render: () => (
      <div className="flex flex-col items-center justify-center h-full px-4 sm:px-6 md:px-12 text-center">
        <div className="text-[#00e599] font-mono text-xl uppercase tracking-widest mb-6">Market Opportunity</div>
        <h2 className="text-5xl font-bold text-white mb-16">The "Under-Collateralized" Gap</h2>
        
        <div className="flex items-end justify-center gap-4 w-full max-w-4xl h-64">
           <div className="w-1/3 bg-zinc-800 rounded-t-xl h-[30%] flex flex-col justify-end p-4 relative group">
              <div className="text-zinc-500 font-bold mb-2">DeFi (Aave/Comp)</div>
              <div className="text-2xl font-bold text-zinc-300">$15B</div>
              <div className="absolute -top-12 left-0 right-0 text-xs text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity">Over-collateralized only.</div>
           </div>
           <div className="w-1/3 bg-[#00e599] rounded-t-xl h-[65%] flex flex-col justify-end p-4 shadow-[0_0_50px_rgba(0,229,153,0.3)] relative group">
              <div className="text-black font-bold mb-2">P3 (SocialFi)</div>
              <div className="text-4xl font-bold text-black">$850B</div>
              <div className="absolute -top-12 left-0 right-0 text-xs text-[#00e599] font-bold">Unsecured Consumer Credit TAM</div>
           </div>
           <div className="w-1/3 bg-zinc-800 rounded-t-xl h-[90%] flex flex-col justify-end p-4 opacity-50">
              <div className="text-zinc-500 font-bold mb-2">Traditional Banks</div>
              <div className="text-2xl font-bold text-zinc-300">$4T+</div>
           </div>
        </div>
        <p className="mt-8 text-zinc-400 max-w-2xl">
          We bridge the gap between DeFi's efficiency and the massive demand for unsecured credit.
        </p>
      </div>
    )
  },
  {
    id: 'business',
    render: () => (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center h-full px-4 sm:px-6 md:px-12">
        <div className="space-y-8">
           <div className="text-[#00e599] font-mono text-xl uppercase tracking-widest">Business Model</div>
           <h2 className="text-5xl font-bold text-white">Protocol Revenue.</h2>
           
           <div className="space-y-6">
              <div className="flex items-start gap-4">
                 <div className="text-4xl font-bold text-[#00e599]">2.0%</div>
                 <div>
                    <h4 className="text-xl font-bold text-white">Origination Fee</h4>
                    <p className="text-zinc-400">Charged on successful loan repayment.</p>
                 </div>
              </div>
              <div className="flex items-start gap-4">
                 <div className="text-4xl font-bold text-blue-500">1.0%</div>
                 <div>
                    <h4 className="text-xl font-bold text-white">Charity Fund</h4>
                    <p className="text-zinc-400">Tax on transactions goes to "Fresh Start" insurance pool.</p>
                 </div>
              </div>
              <div className="flex items-start gap-4">
                 <div className="text-4xl font-bold text-purple-500">$5</div>
                 <div>
                    <h4 className="text-xl font-bold text-white">Referral Boost</h4>
                    <p className="text-zinc-400">Cost per acquisition (paid in Reputation Points).</p>
                 </div>
              </div>
           </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-12 rounded-3xl text-center">
           <h3 className="text-zinc-500 uppercase tracking-widest font-bold mb-4">Projected Year 1 Volume</h3>
           <div className="text-6xl font-bold text-white mb-2">$25M</div>
           <div className="text-[#00e599] font-mono">~$500k Revenue</div>
        </div>
      </div>
    )
  },
  {
    id: 'ask',
    render: () => (
      <div className="flex flex-col items-center justify-center h-full text-center space-y-8 animate-fade-in relative">
        <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none"></div>
        <div className="text-[#00e599] font-mono text-xl uppercase tracking-widest">The Ask</div>
        <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold text-white tracking-tight">Seed Round</h1>
        <div className="text-5xl font-bold text-white border-b-4 border-[#00e599] pb-2">$1.5M</div>
        <div className="flex gap-8 text-zinc-400 text-lg mt-8">
           <span>18 Months Runway</span>
           <span>•</span>
           <span>Legal/Compliance</span>
           <span>•</span>
           <span>Mobile App</span>
        </div>
        <div className="pt-12">
           <p className="text-white font-bold mb-2">Contact</p>
           <a href="mailto:founders@p3lending.space" className="text-2xl text-[#00e599] hover:underline">founders@p3lending.space</a>
           <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
             <a
               href={CALENDLY_MEETING_URL}
               target="_blank"
               rel="noopener noreferrer"
               className="inline-flex items-center rounded-lg bg-[#00e599] px-5 py-2 text-sm font-bold text-black transition-all hover:bg-[#00cc88]"
             >
               Schedule a Meeting
             </a>
             <DonationCheckoutButton
               source="pitch_deck_ask_slide"
               className="inline-flex items-center rounded-lg border border-zinc-600 bg-zinc-900 px-5 py-2 text-sm font-bold text-white transition-all hover:border-zinc-400 hover:text-[#00e599]"
             >
               Donate Now via Stripe
             </DonationCheckoutButton>
           </div>
           <div className="mt-4">
             <a
               href={GO_TO_MARKET_STRATEGY_URL}
               target="_blank"
               rel="noopener noreferrer"
               className="text-sm text-zinc-300 underline decoration-zinc-600 underline-offset-4 transition-colors hover:text-[#00e599] hover:decoration-[#00e599]"
             >
               Go-To-Market Strategy
             </a>
           </div>
        </div>
      </div>
    )
  }
];

export const PitchDeck: React.FC<Props> = ({ onClose }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [donationNotice, setDonationNotice] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        setCurrentSlide(prev => Math.min(prev + 1, SLIDES.length - 1));
      } else if (e.key === 'ArrowLeft') {
        setCurrentSlide(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const donationStatus = search.get('donation');

    if (donationStatus === 'success') {
      setDonationNotice('Donation received. Thank you for supporting P3 Lending.');
    } else if (donationStatus === 'cancelled') {
      setDonationNotice('Donation checkout was canceled.');
    } else {
      return;
    }

    search.delete('donation');
    search.delete('session_id');
    const nextQuery = search.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
    window.history.replaceState({}, document.title, nextUrl);
  }, []);

  return (
    <div className="fixed inset-0 bg-[#050505] z-[9999] flex flex-col">
      {donationNotice && (
        <div className="absolute top-16 left-4 right-4 z-50 mx-auto max-w-xl rounded-xl border border-[#00e599]/40 bg-[#00e599]/10 px-4 py-2 text-center text-xs font-semibold text-[#9ff8d7] sm:text-sm">
          {donationNotice}
        </div>
      )}
      <div className="absolute top-3 sm:top-6 left-3 sm:left-6 flex flex-wrap items-center gap-2 sm:gap-3 z-50">
        <a
          href={CALENDLY_MEETING_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-lg border border-[#00e599]/50 bg-[#00e599]/10 px-3 py-2 text-xs font-bold text-[#00e599] hover:bg-[#00e599]/20"
        >
          Book Calendly Call
        </a>
        <DonationCheckoutButton
          source="pitch_deck_header"
          className="inline-flex items-center rounded-lg border border-zinc-700 bg-zinc-900/90 px-3 py-2 text-xs font-bold text-zinc-100 hover:border-zinc-500 hover:text-[#00e599]"
        >
          Donate via Stripe
        </DonationCheckoutButton>
      </div>

      {/* Controls */}
      <div className="absolute top-3 sm:top-6 right-3 sm:right-6 flex items-center gap-3 sm:gap-4 z-50">
         <div className="text-zinc-500 font-mono text-sm">
           {currentSlide + 1} / {SLIDES.length}
         </div>
         <button onClick={onClose} className="text-white hover:text-red-500 transition-colors" aria-label="Close pitch deck">
           <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
         </button>
      </div>

      {/* Slide Content */}
      <div className="flex-1 w-full max-w-7xl mx-auto pt-16 sm:pt-20 md:pt-12 pb-24 md:pb-20 px-3 sm:px-4 relative overflow-y-auto custom-scrollbar">
         {SLIDES[currentSlide].render()}
      </div>

      {/* Progress Bar */}
      <div className="h-1 bg-zinc-900 w-full fixed bottom-0 left-0">
         <div 
           className="h-full bg-[#00e599] transition-all duration-300 ease-out"
           style={{ width: `${((currentSlide + 1) / SLIDES.length) * 100}%` }}
         ></div>
      </div>

      {/* Navigation Hints */}
      <div className="fixed bottom-4 sm:bottom-6 left-4 right-4 sm:left-auto sm:right-6 flex justify-end gap-2">
         <Button size="sm" variant="secondary" onClick={() => setCurrentSlide(prev => Math.max(prev - 1, 0))} disabled={currentSlide === 0}>←</Button>
         <Button size="sm" variant="primary" onClick={() => setCurrentSlide(prev => Math.min(prev + 1, SLIDES.length - 1))} disabled={currentSlide === SLIDES.length - 1}>→</Button>
      </div>
    </div>
  );
};
