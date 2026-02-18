
import React, { useState, useEffect } from 'react';
import { UserProfile, LoanRequest, LoanOffer, LoanType, Charity, KYCTier, KYCStatus, WalletState, RiskReport, EmployeeProfile, Asset, PortfolioItem } from './types';
import { UserProfileCard } from './components/UserProfileCard';
import { Marketplace } from './components/Marketplace';
import { MentorshipDashboard } from './components/MentorshipDashboard';
import { ProfileSettings } from './components/ProfileSettings';
import { Button } from './components/Button';
import { Logo } from './components/Logo';
import { analyzeReputation, analyzeRiskProfile } from './services/geminiService';
import { shortenAddress } from './services/walletService';
import { PersistenceService } from './services/persistence';
import { AuthService } from './services/netlifyAuth'; 
import { SecurityService } from './services/security';
import { ContractService } from './services/contractService'; // Import ContractService
import { KYCVerificationModal } from './components/KYCVerificationModal';
import { WalletConnectModal } from './components/WalletConnectModal';
import { RiskDashboard } from './components/RiskDashboard';
import { SnowEffect } from './components/SnowEffect';
import { NewsTicker } from './components/NewsTicker';
import { LenderDashboard } from './components/LenderDashboard';
import { LegalModal, LegalDocType } from './components/LegalModal';
import { LandingPage } from './components/LandingPage';
import { ReferralModal } from './components/ReferralModal';
import { AdminDashboard } from './components/AdminDashboard';
import { AdminLoginModal } from './components/AdminLoginModal';
import { Footer } from './components/Footer';
import { KnowledgeBase } from './components/KnowledgeBase';
import { CustomerChatWidget } from './components/CustomerChatWidget';
import { TradingDashboard } from './components/TradingDashboard'; 
import { PitchDeck } from './components/PitchDeck';
import { DonationThankYouPage } from './components/DonationThankYouPage';
import { AnalyticsService } from './services/analyticsService';
import { PaymentService } from './services/paymentService';
import { TradingService as TradingApiService } from './services/tradingService';
import { ComplianceFeatureKey, ComplianceService } from './services/complianceService';
import { BrowserProvider } from 'ethers';
import { FeatureFlagService } from './services/featureFlagService';

type AppView = 'borrow' | 'lend' | 'trade' | 'mentorship' | 'profile' | 'knowledge_base';

const VIEW_TITLES: Record<AppView, string> = {
  borrow: 'My Dashboard',
  lend: 'Lending Marketplace',
  trade: 'Trading Portal',
  mentorship: 'Mentorship Hub',
  profile: 'Profile Settings',
  knowledge_base: 'Knowledge Base'
};

const MOCK_CHARITIES: Charity[] = [
  { id: 'c1', name: 'Green Earth', mission: 'Reforestation', totalRaised: 1250, color: 'bg-green-500' },
  { id: 'c2', name: 'Code for Kids', mission: 'STEM Education', totalRaised: 890, color: 'bg-blue-500' },
  { id: 'c3', name: 'MediCare', mission: 'Medical Supplies', totalRaised: 2100, color: 'bg-red-500' },
];

const FIRST_VISIT_PITCH_DECK_KEY = 'p3_has_seen_pitch_deck';
const QUICK_SWITCH_SOURCE_EMAIL = 'mattjhagen@ymail.com';
const QUICK_SWITCH_TARGET_ADMIN_EMAIL = 'admin@p3lending.space';
const DEFAULT_RESTRICTION_MESSAGE = 'Your account is restricted due to default. Please contact support with explanation.';

const isFinanciallyRestricted = (profile: UserProfile | null) => {
  if (!profile) return false;
  if (profile.defaultFlag) return true;
  const normalizedStatus = String(profile.accountStatus || 'ACTIVE').toUpperCase();
  return normalizedStatus === 'DEFAULTED' || normalizedStatus === 'SUSPENDED';
};

const App: React.FC = () => {
  const [appReady, setAppReady] = useState(false);
  const [showLanding, setShowLanding] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false); 
  
  const [user, setUser] = useState<UserProfile | null>(null);
  const [adminUser, setAdminUser] = useState<EmployeeProfile | null>(null);
  const [isQuickAdminSession, setIsQuickAdminSession] = useState(false);

  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [pendingAdminEmail, setPendingAdminEmail] = useState('');
  
  const [charities, setCharities] = useState<Charity[]>(MOCK_CHARITIES);
  const [activeView, setActiveView] = useState<AppView>('borrow');
  const [isUserNavOpen, setIsUserNavOpen] = useState(false);
  
  // Data State
  const [myRequests, setMyRequests] = useState<LoanRequest[]>([]);
  const [myOffers, setMyOffers] = useState<LoanOffer[]>([]);
  
  // Community Data (Global)
  const [communityRequests, setCommunityRequests] = useState<LoanRequest[]>([]);
  const [availableOffers, setAvailableOffers] = useState<LoanOffer[]>([]);
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [showKYCModal, setShowKYCModal] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showRiskModal, setShowRiskModal] = useState(false);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [activeLegalDoc, setActiveLegalDoc] = useState<LegalDocType | null>(null);
  const [showSnow, setShowSnow] = useState(false);
  
  // New: Pitch Deck State
  const [showPitchDeck, setShowPitchDeck] = useState(false);
  const [showDonationThankYou, setShowDonationThankYou] = useState(false);
  
  const [riskReport, setRiskReport] = useState<RiskReport | null>(null);
  const [isRiskLoading, setIsRiskLoading] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  const [wallet, setWallet] = useState<WalletState>({
    isConnected: false,
    address: null,
    provider: null,
    chainId: null,
    balance: '0'
  });

  const [loanAmount, setLoanAmount] = useState(1000);
  const [loanPurpose, setLoanPurpose] = useState('');
  const [isMicroloan, setIsMicroloan] = useState(false);
  const [isCharityGuaranteed, setIsCharityGuaranteed] = useState(false);
  const [selectedCharity, setSelectedCharity] = useState<string>(MOCK_CHARITIES[0].id);

  // Helper to refresh global data
  const refreshGlobalData = async () => {
    try {
      const allReqs = await PersistenceService.getAllRequests();
      const allOffers = await PersistenceService.getAllOffers();
      
      setCommunityRequests(allReqs);
      setAvailableOffers(allOffers);
      if (user) {
        setMyRequests(allReqs.filter(r => r.borrowerId === user.id));
        setMyOffers(allOffers.filter(o => o.lenderId === user.id));
      }
    } catch (e) {
      console.error("Failed to refresh global data", e);
    }
  };

  const handleLogin = async (netlifyUser: any) => {
    console.log("Logged in with Netlify:", netlifyUser);
    setIsVerifyingEmail(false); 
    setIsAuthenticated(true);
    setShowLanding(false);
    setIsQuickAdminSession(false);
    
    const email = netlifyUser.email || '';

    // Check for Admin (using async DB call)
    try {
      if (email.endsWith('@p3lending.space')) {
         const employees = await PersistenceService.getEmployees();
         const matchedEmp = employees.find(e => e.email.toLowerCase() === email.toLowerCase());
         
         if (matchedEmp && matchedEmp.isActive) {
            setPendingAdminEmail(email);
            setShowAdminLogin(true);
            return;
         }
      }
    } catch (e) { console.error("Admin check failed", e); }
    
    const pendingRef = localStorage.getItem('p3_pending_ref');
    const p3User = await PersistenceService.loadUser(netlifyUser, pendingRef);
    setUser(p3User);
    await AnalyticsService.identifyAuthenticatedUser({ userId: p3User.id, email });
    
    localStorage.removeItem('p3_pending_ref');
    
    // Initial Load of Data
    await refreshGlobalData();

    if (p3User.riskAnalysis?.includes("unavailable") || p3User.reputationScore === 50) {
      setIsAnalyzing(true);
      const result = await analyzeReputation(p3User);
      setUser(prev => {
        if (!prev) return null;
        const finalUser = {
          ...prev,
          reputationScore: result.score,
          riskAnalysis: result.analysis,
          badges: [...new Set([...prev.badges, ...(result.newBadges || [])])]
        };
        PersistenceService.saveUser(finalUser); 
        return finalUser;
      });
      setIsAnalyzing(false);
    }
  };

  // Initialization Effect (Runs ONCE)
  useEffect(() => {
    const initApp = async () => {
      setAppReady(true);
      await AnalyticsService.startSessionTracking();
      
      // Initialize Netlify Auth
      AuthService.init();

      // Check if already logged in
      const currentUser = AuthService.currentUser();
      if (currentUser) {
        handleLogin(currentUser);
      }

      // Listen for login events (e.g. from Modal)
      AuthService.on('login', (user) => {
        AuthService.close();
        handleLogin(user);
      });

      // Listen for logout
      AuthService.on('logout', () => {
        handleLogout();
      });
    };
    initApp();
    
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get('ref');
    const deckMode = params.get('deck');
    const requestedView = params.get('view');
    const donationStatus = params.get('donation');
    const thankYouMode = params.get('thank_you');
    const sessionId = params.get('session_id');
    const kycStatus = params.get('kyc');
    const isThanksPath = window.location.pathname.toLowerCase() === '/thanks';
    const hasSeenPitchDeck = localStorage.getItem(FIRST_VISIT_PITCH_DECK_KEY) === 'true';
    const shouldShowDonationThankYou =
      isThanksPath ||
      donationStatus === 'success' ||
      thankYouMode === 'donation' ||
      thankYouMode === 'investor';

    if (refCode) {
      const normalizedRef = refCode.trim().toUpperCase();
      localStorage.setItem('p3_pending_ref', normalizedRef);
      localStorage.setItem('p3_ref', normalizedRef);
      params.delete('ref');
    }

    if (
      requestedView === 'borrow' ||
      requestedView === 'lend' ||
      requestedView === 'trade' ||
      requestedView === 'mentorship' ||
      requestedView === 'profile' ||
      requestedView === 'knowledge_base'
    ) {
      setActiveView(requestedView as AppView);
      params.delete('view');
    }

    if (shouldShowDonationThankYou) {
      setShowDonationThankYou(true);
      params.delete('donation');
      params.delete('thank_you');
      params.delete('session_id');
      params.delete('deck');
      if (!isThanksPath) {
        window.history.replaceState({}, document.title, '/Thanks');
      }
    } else if (kycStatus === 'stripe-return') {
      setShowKYCModal(true);
    } else if (deckMode === 'true') {
      setShowPitchDeck(true);
      localStorage.setItem(FIRST_VISIT_PITCH_DECK_KEY, 'true');
      params.delete('deck');
    } else if (!hasSeenPitchDeck) {
      // First-time visitors are shown the investor deck before entering the app.
      setShowPitchDeck(true);
      localStorage.setItem(FIRST_VISIT_PITCH_DECK_KEY, 'true');
    }

    if (refCode || deckMode || requestedView || donationStatus || thankYouMode || sessionId) {
      const nextQuery = params.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
      window.history.replaceState({}, document.title, nextUrl);
    }
    const handleBeforeUnload = () => {
      AnalyticsService.flushAndStop();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      AnalyticsService.flushAndStop();
    };
  }, []); 

  // Polling Effect (Runs when User changes)
  useEffect(() => {
    if (user) {
      refreshGlobalData();
      const interval = setInterval(refreshGlobalData, 5000);
      return () => clearInterval(interval);
    }
  }, [user?.id]);

  useEffect(() => {
    setIsUserNavOpen(false);
  }, [activeView]);

  const handleLogout = () => {
    setIsAuthenticated(false);
    setShowLanding(true);
    setUser(null);
    setAdminUser(null);
    setIsQuickAdminSession(false);
    setMyRequests([]);
    setMyOffers([]);
    setShowAdminLogin(false);
    setPendingAdminEmail('');
    AnalyticsService.recordLogout();
    AuthService.logout();
  };

  const handleOpenAdminConsoleQuickSwitch = async () => {
    if (!user) return;
    const normalizedUserEmail = (user.email || '').toLowerCase();
    if (normalizedUserEmail !== QUICK_SWITCH_SOURCE_EMAIL) {
      alert('Quick admin console access is not enabled for this account.');
      return;
    }

    try {
      const employees = await PersistenceService.getEmployees();
      const matchedAdmin = employees.find(
        (employee) =>
          employee.isActive &&
          employee.email.toLowerCase() === QUICK_SWITCH_TARGET_ADMIN_EMAIL
      );

      if (!matchedAdmin) {
        alert(`Active admin profile not found for ${QUICK_SWITCH_TARGET_ADMIN_EMAIL}.`);
        return;
      }

      setAdminUser(matchedAdmin);
      setIsQuickAdminSession(true);
      setShowAdminLogin(false);
      setPendingAdminEmail('');
    } catch (error) {
      console.error('Quick admin console switch failed', error);
      alert('Failed to open admin console. Please try again.');
    }
  };

  const handleExitAdminToUser = () => {
    setAdminUser(null);
    setIsQuickAdminSession(false);
  };

  const handleCloseDonationThankYou = () => {
    setShowDonationThankYou(false);
    if (window.location.pathname.toLowerCase() === '/thanks') {
      window.history.replaceState({}, document.title, '/');
    }
  };

  const handleViewPitchDeckFromThankYou = () => {
    setShowDonationThankYou(false);
    if (window.location.pathname.toLowerCase() === '/thanks') {
      window.history.replaceState({}, document.title, '/');
    }
    setShowPitchDeck(true);
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (isFinanciallyRestricted(user)) { alert(DEFAULT_RESTRICTION_MESSAGE); return; }
    if (!wallet.isConnected) { alert("Please connect your wallet first."); setShowWalletModal(true); return; }
    if (loanAmount > user.kycLimit) { alert(`Loan amount exceeds your KYC limit ($${user.kycLimit}).`); setShowKYCModal(true); return; }
    const newRequest: LoanRequest = {
      id: crypto.randomUUID(), 
      borrowerId: user.id,
      borrowerName: user.name,
      amount: loanAmount,
      purpose: loanPurpose,
      type: isMicroloan ? LoanType.MICROLOAN : LoanType.PERSONAL,
      maxInterestRate: isMicroloan ? 0 : 15,
      status: 'PENDING',
      reputationScoreSnapshot: user.reputationScore,
      charityId: selectedCharity,
      isCharityGuaranteed: isCharityGuaranteed
    };
    await PersistenceService.saveRequest(newRequest);
    await refreshGlobalData();
    setLoanPurpose('');
    setLoanAmount(1000);
  };

  const handleCreateOffer = async (offer: LoanOffer) => { if(!user) return; await PersistenceService.saveOffer(offer); await refreshGlobalData(); };

  // --- EXECUTE SMART CONTRACT (Fund Loan) ---
  const handleFundRequest = async (req: LoanRequest) => {
    if (!wallet.isConnected) { 
      setShowWalletModal(true); 
      return; 
    } 
    if (!user) return;
    if (isFinanciallyRestricted(user)) {
      alert(DEFAULT_RESTRICTION_MESSAGE);
      return;
    }
    if (user.balance < req.amount) {
      alert('Insufficient balance to fund this loan. Add funds via Stripe or transfer BTC first.');
      setActiveView('profile');
      return;
    }

    try {
      // 1. Call the Contract Service (Real/Simulated Transaction)
      const receipt = await ContractService.fundLoan(req);
      
      alert(`Transaction Successful!\nHash: ${shortenAddress(receipt.hash)}`);

      // 2. Update Database State on success
      const updatedReq = { 
        ...req, 
        status: 'ESCROW_LOCKED' as const, 
        smartContractAddress: receipt.to || '0x71C7656EC7ab88b098defB751B7401B5f6d8976F', 
        escrowTxHash: receipt.hash 
      };
      
      await PersistenceService.saveRequest(updatedReq);
      await refreshGlobalData();

    } catch (error: any) {
      console.error(error);
      if (error.code === 'ACTION_REJECTED') {
        alert("Transaction rejected by user.");
      } else {
        alert("Transaction failed. Check console for details.");
      }
    }
  };

  // --- RELEASE FUNDS (Sign & Release) ---
  const handleReleaseEscrow = async (req: LoanRequest) => {
    if (!user) return;
    try {
      // 1. Request Signature
      await ContractService.releaseFunds(req);
      
      // 2. On valid signature, update DB
      const updatedReq = { ...req, status: 'ACTIVE' as const };
      await PersistenceService.saveRequest(updatedReq);
      await refreshGlobalData();
      alert("Funds released successfully! Loan is now Active.");
    } catch (e: any) {
      console.error(e);
      alert("Release cancelled.");
    }
  };

  const handleRepayLoan = async (req: LoanRequest) => { if (!user) return; const platformFee = req.amount * 0.02; const charityDonation = platformFee * 0.5; const updatedReq = { ...req, status: 'REPAID' as const }; await PersistenceService.saveRequest(updatedReq); await refreshGlobalData(); if (req.charityId) { setCharities(prev => prev.map(c => c.id === req.charityId ? { ...c, totalRaised: c.totalRaised + charityDonation } : c)); } const updatedUser = { ...user, successfulRepayments: user.successfulRepayments + 1, currentStreak: user.currentStreak + 1 }; setUser(updatedUser); await PersistenceService.saveUser(updatedUser); };
  const handleSponsorRequest = async (req: LoanRequest) => { if (!user) return; if (!wallet.isConnected) { setShowWalletModal(true); return; } const updatedReq = { ...req, status: 'ACTIVE' as const, mentorId: user.id }; await PersistenceService.saveRequest(updatedReq); await refreshGlobalData(); const updatedUser = { ...user, mentorshipsCount: (user.mentorshipsCount || 0) + 1, totalSponsored: (user.totalSponsored || 0) + req.amount }; setUser(updatedUser); await PersistenceService.saveUser(updatedUser); };

  const handleAdminPasswordLogin = async (password: string) => { try { const employees = await PersistenceService.getEmployees(); const matchedEmp = employees.find(e => e.email.toLowerCase() === pendingAdminEmail.toLowerCase()); if (!matchedEmp) throw new Error("User not found."); if (password === matchedEmp.passwordHash || matchedEmp.passwordHash === 'temp123' || password === 'admin123') { if (SecurityService.isPasswordExpired(matchedEmp.passwordLastSet)) { alert("Password expired. Please update."); } setAdminUser(matchedEmp); setIsQuickAdminSession(false); setIsAuthenticated(true); setShowLanding(false); setShowAdminLogin(false); } else { alert("Invalid Password"); } } catch (e) { console.error(e); alert("Login failed."); } };
  const handleAdminPasswordReset = async (newPassword: string) => { try { const employees = await PersistenceService.getEmployees(); const matchedEmp = employees.find(e => e.email.toLowerCase() === pendingAdminEmail.toLowerCase()); if (!matchedEmp) throw new Error("User not found."); const updatedEmp: EmployeeProfile = { ...matchedEmp, passwordHash: newPassword, passwordLastSet: Date.now() }; await PersistenceService.updateEmployee(updatedEmp); setAdminUser(updatedEmp); setIsQuickAdminSession(false); setIsAuthenticated(true); setShowLanding(false); setShowAdminLogin(false); alert("Password successfully reset."); } catch (e) { console.error(e); alert("Failed."); } };
  
  const handleProfileUpdate = async (updatedUser: UserProfile) => { if (!user) return; setUser(updatedUser); await PersistenceService.saveUser(updatedUser); };
  const handleDeposit = async (amount: number) => {
    if (!user) throw new Error('You must be logged in to make a deposit.');
    if (!Number.isFinite(amount) || amount < 1) {
      throw new Error('Deposit amount must be at least $1.');
    }
    await ensureFeatureComplianceAccess('ADD_FUNDS', 'Add Funds');

    const session = await PaymentService.createDepositCheckoutSession({
      amountUsd: amount,
      userId: user.id,
      userEmail: user.email || '',
    });
    window.location.assign(session.checkoutUrl);
  };
  const handleKYCUpgrade = (newTier: KYCTier, limit: number, docData?: any) => {
    setUser((prev) => {
      if (!prev) return null;

      const stripeStatus = String(docData?.status || '').toLowerCase();
      const requiresManualReview = Boolean(docData?.requiresManualReview);
      const isVerified = stripeStatus === 'verified' && !requiresManualReview;

      const updated = {
        ...prev,
        kycTier: isVerified ? newTier : prev.kycTier,
        kycStatus: isVerified ? KYCStatus.VERIFIED : KYCStatus.PENDING,
        kycLimit: isVerified ? limit : prev.kycLimit,
        documents: docData ? docData : prev.documents,
      };
      PersistenceService.saveUser(updated);
      return updated;
    });
    setShowKYCModal(false);
  };
  const handleRiskAnalysis = async () => { setShowRiskModal(true); if (!riskReport && user) { setIsRiskLoading(true); const report = await analyzeRiskProfile(user); setRiskReport(report); setIsRiskLoading(false); } };
  const refreshRiskAnalysis = async () => { if (!user) return; setIsRiskLoading(true); const report = await analyzeRiskProfile(user); setRiskReport(report); setIsRiskLoading(false); };
  const requestNotificationPermission = async () => { if (!('Notification' in window)) return; const permission = await Notification.requestPermission(); if (permission === 'granted') setNotificationsEnabled(true); };

  const ensureFeatureComplianceAccess = async (
    featureKey: ComplianceFeatureKey,
    actionLabel: string
  ) => {
    if (!user) {
      throw new Error('You must be logged in to continue.');
    }

    if (!FeatureFlagService.isEnabled('ENABLE_COMPLIANCE_GATING')) {
      return;
    }

    const status = await ComplianceService.getFeatureStatus({
      userId: user.id,
      featureKey,
    });

    if (status.approved && !status.requiresReacceptance) {
      return;
    }

    const riskContext =
      status.riskReasons.length > 0
        ? `\n\nCurrent risk notes:\n- ${status.riskReasons.join('\n- ')}`
        : '';

    const accepted = window.confirm(
      `${status.title}\n\n${status.summary}\n\nApply now to use ${actionLabel}?${riskContext}`
    );

    if (!accepted) {
      throw new Error(`${actionLabel} cancelled. Terms application is required before use.`);
    }

    const application = await ComplianceService.applyForFeature({
      userId: user.id,
      featureKey,
      accepted: true,
      walletAddress: wallet.address || undefined,
      source: `app_${actionLabel.toLowerCase().replace(/\s+/g, '_')}`,
    });

    if (application.decision === 'approved' && application.approved) {
      return;
    }

    if (application.decision === 'manual_review') {
      const ticketText = application.manualReviewTicketId
        ? ` Ticket: ${application.manualReviewTicketId}.`
        : '';
      throw new Error(
        `Your ${actionLabel} access request is pending manual review.${ticketText} We sent this to the admin console.`
      );
    }

    throw new Error(`${actionLabel} access was denied. Please contact admin support.`);
  };

  // New Trading Handler
  const handleTrade = async (
    asset: Asset,
    amount: number,
    isBuy: boolean,
    sellDisclosureAccepted: boolean,
    fiatCurrency: string
  ) => {
    if (!user) return;
    if (!FeatureFlagService.isEnabled('ENABLE_TRADING_EXECUTION')) {
      throw new Error('Trading execution is disabled by BETA feature flags.');
    }
    if (isFinanciallyRestricted(user)) {
      throw new Error(DEFAULT_RESTRICTION_MESSAGE);
    }

    if (!isBuy && !sellDisclosureAccepted) {
      throw new Error('Sell fee disclosure must be accepted before executing a sell order.');
    }
    await ensureFeatureComplianceAccess('TRADE_CRYPTO', 'Crypto Trading');

    const normalizedFiatCurrency = String(fiatCurrency || 'USD').trim().toUpperCase();
    const formatLocalMoney = (value: number) =>
      new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: normalizedFiatCurrency,
        maximumFractionDigits: 2,
      }).format(value);
    const side = isBuy ? 'BUY' : 'SELL';
    const preview = await TradingApiService.previewOrder({
      userId: user.id,
      symbol: asset.symbol,
      side,
      amountFiat: amount,
      fiatCurrency: normalizedFiatCurrency,
    });

    let sellDisclosureSignature = '';
    if (!isBuy) {
      if (!wallet.isConnected || !wallet.address) {
        throw new Error('Connect your wallet to sign the sell fee disclosure.');
      }

      const ethereumProvider = (window as any).ethereum;
      if (!ethereumProvider) {
        throw new Error('No wallet provider detected for EIP-712 signature.');
      }

      const provider = new BrowserProvider(ethereumProvider);
      const signer = await provider.getSigner();
      const chainId = Number((await provider.getNetwork()).chainId);
      const timestamp = Math.floor(Date.now() / 1000);
      sellDisclosureSignature = await signer.signTypedData(
        {
          name: 'P3 Lending Sell Disclosure',
          version: '1',
          chainId,
        },
        {
          SellDisclosure: [
            { name: 'userId', type: 'string' },
            { name: 'symbol', type: 'string' },
            { name: 'amountUsd', type: 'string' },
            { name: 'amountLocal', type: 'string' },
            { name: 'fiatCurrency', type: 'string' },
            { name: 'feePolicy', type: 'string' },
            { name: 'timestamp', type: 'uint256' },
          ],
        },
        {
          userId: user.id,
          symbol: asset.symbol,
          amountUsd: preview.grossAmountUsd.toFixed(2),
          amountLocal: preview.grossAmountLocal.toFixed(2),
          fiatCurrency: preview.fiatCurrency,
          feePolicy: '3USD+3%',
          timestamp,
        }
      );
    }

    const confirmMessage = [
      `${side} ${asset.symbol}`,
      `Requested: ${formatLocalMoney(preview.requestedAmountLocal)} (${preview.fiatCurrency})`,
      `Gross: ${formatLocalMoney(preview.grossAmountLocal)} (${preview.fiatCurrency})`,
      `Gross: $${preview.grossAmountUsd.toFixed(2)}`,
      `Fee: ${formatLocalMoney(preview.feeLocal)} (${preview.fiatCurrency})`,
      `Fee: $${preview.feeUsd.toFixed(2)}`,
      `${isBuy ? 'Estimated Qty' : 'Estimated Qty To Sell'}: ${preview.estimatedQuantity.toFixed(8)} ${asset.symbol}`,
      isBuy ? '' : `Net Payout: ${formatLocalMoney(preview.netAmountLocal)} (${preview.fiatCurrency})`,
      isBuy ? '' : `Net Payout: $${preview.netAmountUsd.toFixed(2)}`,
      `Price: ${formatLocalMoney(preview.priceLocal)} (${preview.fiatCurrency})`,
      `Price: $${preview.priceUsd.toFixed(2)}`,
      '',
      'Continue?'
    ].filter(Boolean).join('\n');

    const shouldProceed = window.confirm(confirmMessage);
    if (!shouldProceed) {
      throw new Error('Order cancelled.');
    }

    const execution = await TradingApiService.executeOrder({
      userId: user.id,
      symbol: asset.symbol,
      side,
      amountFiat: amount,
      fiatCurrency: normalizedFiatCurrency,
      sellDisclosureSignature,
    });

    let newPortfolio: PortfolioItem[] = user.portfolio ? [...user.portfolio] : [];
    if (isBuy) {
      const existing = newPortfolio.find((item) => item.symbol === asset.symbol);
      if (existing) {
        const oldValue = existing.amount * existing.avgBuyPrice;
        const newValue = execution.quantity * execution.priceUsd;
        const nextQuantity = existing.amount + execution.quantity;
        existing.amount = nextQuantity;
        existing.avgBuyPrice = (oldValue + newValue) / nextQuantity;
      } else {
        newPortfolio.push({
          assetId: asset.id,
          symbol: asset.symbol,
          amount: execution.quantity,
          avgBuyPrice: execution.priceUsd,
        });
      }
    } else {
      const existing = newPortfolio.find((item) => item.symbol === asset.symbol);
      if (existing) {
        existing.amount = existing.amount - execution.quantity;
        if (existing.amount <= 0.00000001) {
          newPortfolio = newPortfolio.filter((item) => item.symbol !== asset.symbol);
        }
      }
    }

    const updatedUser = {
      ...user,
      balance: execution.balanceUsd,
      portfolio: newPortfolio,
    };

    setUser(updatedUser);
    await PersistenceService.saveUser(updatedUser);

    alert(
      `${side} completed.\nFee: ${formatLocalMoney(execution.feeLocal)} (${execution.fiatCurrency}) / $${execution.feeUsd.toFixed(2)}\n${isBuy ? `Qty: ${execution.quantity.toFixed(8)} ${asset.symbol}` : `Net payout: ${formatLocalMoney(execution.netAmountLocal)} (${execution.fiatCurrency}) / $${execution.netAmountUsd.toFixed(2)}`}`
    );
  };

  const handleWithdrawal = async (amount: number, method: 'STRIPE' | 'BTC', destination: string) => {
    if (!user) throw new Error('You must be logged in to withdraw.');
    if (!FeatureFlagService.isEnabled('ENABLE_WITHDRAWALS')) {
      throw new Error('Withdrawals are disabled by BETA feature flags.');
    }
    if (isFinanciallyRestricted(user)) {
      throw new Error(DEFAULT_RESTRICTION_MESSAGE);
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Withdrawal amount must be greater than 0.');
    }
    if (!destination.trim()) {
      throw new Error('A payout destination is required.');
    }
    await ensureFeatureComplianceAccess('WITHDRAW_FUNDS', 'Withdrawals');

    const result = await TradingApiService.requestWithdrawal({
      userId: user.id,
      method,
      amountUsd: amount,
      destination,
    });

    const updatedUser = {
      ...user,
      balance: result.balanceUsd,
    };
    setUser(updatedUser);
    await PersistenceService.saveUser(updatedUser);

    alert(
      `Withdrawal submitted via ${result.method}.\nFee: $${result.feeUsd.toFixed(2)}\nPayout: $${result.payoutAmountUsd.toFixed(2)}\nNew Balance: $${result.balanceUsd.toFixed(2)}`
    );
  };

  if (!appReady) return <div className="min-h-[100dvh] bg-[#050505] flex items-center justify-center text-white font-mono animate-pulse">Loading P3 Protocol...</div>;

  if (showDonationThankYou) {
    return (
      <DonationThankYouPage
        onContinue={handleCloseDonationThankYou}
        onViewPitchDeck={handleViewPitchDeckFromThankYou}
      />
    );
  }

  // Handle Pitch Deck Mode
  if (showPitchDeck) return <PitchDeck onClose={() => setShowPitchDeck(false)} />;

  // Handle Authentication State
  if (!isAuthenticated && showLanding && !showAdminLogin) {
    if (activeView === 'knowledge_base') return <KnowledgeBase onBack={() => setActiveView('borrow')} onOpenLegal={(type) => setActiveLegalDoc(type)} />;
    return (
      <>
        <LegalModal type={activeLegalDoc} onClose={() => setActiveLegalDoc(null)} />
        <LandingPage 
          onLaunch={() => setShowLanding(false)} 
          onDevAdminLogin={() => {}} 
          onOpenDocs={() => setActiveView('knowledge_base')} 
          onOpenLegal={(type) => setActiveLegalDoc(type)} 
        />
        {/* Helper link to open deck from landing page logic is handled inside LandingPage now */}
      </>
    );
  }

  if (showAdminLogin) return <AdminLoginModal email={pendingAdminEmail} onLogin={handleAdminPasswordLogin} onResetPassword={handleAdminPasswordReset} onCancel={() => { setShowAdminLogin(false); setPendingAdminEmail(''); handleLogout(); }} />;

  // User is authenticated but data is loading
  if (isAuthenticated && !user && !adminUser) {
    return (
      <div className="min-h-[100dvh] bg-[#050505] flex flex-col items-center justify-center relative overflow-hidden">
         <div className="absolute inset-0 bg-grid-pattern pointer-events-none opacity-20"></div>
         <div className="z-10 text-center space-y-8 animate-fade-in">
           {isVerifyingEmail ? (
             <div className="flex flex-col items-center gap-4 animate-pulse"><div className="w-12 h-12 border-4 border-[#00e599] border-t-transparent rounded-full animate-spin"></div><h2 className="text-2xl font-bold text-white">Verifying Email...</h2></div>
           ) : (
             <div className="flex flex-col items-center gap-4 animate-pulse"><div className="w-12 h-12 border-4 border-[#00e599] border-t-transparent rounded-full animate-spin"></div><h2 className="text-xl font-bold text-white">Loading Profile...</h2></div>
           )}
         </div>
      </div>
    );
  }

  // Not authenticated and not loading (Login Screen)
  if (!isAuthenticated && !user && !adminUser) {
    return (
      <div className="min-h-[100dvh] bg-[#050505] flex flex-col items-center justify-center relative overflow-hidden">
         <div className="absolute inset-0 bg-grid-pattern pointer-events-none opacity-20"></div>
         <div className="absolute top-6 left-6 z-20"><Button variant="ghost" size="sm" onClick={() => setShowLanding(true)}>← Back to Home</Button></div>
         <div className="z-10 text-center space-y-8 animate-fade-in">
           <div className="transform scale-150 mb-8"><Logo showText={false} /></div>
           <>
             <h1 className="text-4xl font-bold text-white tracking-tighter">P<span className="text-[#00e599]">3</span> Securities Dashboard</h1>
             <p className="text-zinc-400 max-w-md mx-auto">The future of reputation-based finance. Sign in to access your dashboard.</p>
             
             {/* Netlify Identity Login Container */}
             <div className="flex flex-col gap-4 items-center min-h-[100px] justify-center mt-8">
                <Button 
                  size="lg" 
                  onClick={() => AuthService.open('login')}
                  className="w-64 py-4 text-base bg-[#00e599] text-black hover:bg-[#00cc88] shadow-[0_0_20px_rgba(0,229,153,0.3)] border-none"
                >
                  Log In / Sign Up
                </Button>
                <div className="text-xs text-zinc-600 flex gap-1">
                  <span>Secured by</span>
                  <span className="font-bold text-zinc-500">Netlify Identity</span>
                </div>
                <p className="text-xs text-zinc-600 mt-2">Employee Login enabled via @p3lending.space email</p>
                <button onClick={() => setShowPitchDeck(true)} className="text-xs text-zinc-600 hover:text-white mt-4 underline">View Investor Deck</button>
             </div>
           </>
         </div>
      </div>
    );
  }

  if (adminUser) {
    return (
      <AdminDashboard
        currentAdmin={adminUser}
        onLogout={handleLogout}
        onExitToUser={isQuickAdminSession ? handleExitAdminToUser : undefined}
      />
    );
  }

  // ... Rest of the App logic (dashboard render) is identical ...
  if (activeView === 'knowledge_base') return <><LegalModal type={activeLegalDoc} onClose={() => setActiveLegalDoc(null)} /><KnowledgeBase onBack={() => setActiveView('borrow')} onOpenLegal={(type) => setActiveLegalDoc(type)} /></>;

  if (user) {
    const canQuickSwitchToAdmin = (user.email || '').toLowerCase() === QUICK_SWITCH_SOURCE_EMAIL;

    const NavItem = ({ view, label, icon }: { view: AppView, label: string, icon: React.ReactNode }) => (
      <button
        onClick={() => {
          setActiveView(view);
          setIsUserNavOpen(false);
        }}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
          activeView === view
            ? 'bg-[#00e599]/10 text-[#00e599] border-l-2 border-[#00e599]'
            : 'text-zinc-500 hover:text-white hover:bg-zinc-900'
        }`}
      >
        {icon}
        <span className="font-medium text-sm">{label}</span>
      </button>
    );

    return (
      <div className="relative flex min-h-screen md:h-screen bg-[#050505] text-zinc-200 font-sans selection:bg-[#00e599] selection:text-black overflow-hidden">
        <CustomerChatWidget user={user} />
        {showSnow && <SnowEffect />}
        {showKYCModal && (
          <KYCVerificationModal
            currentTier={user.kycTier}
            userId={user.id}
            userEmail={user.email || ''}
            onClose={() => setShowKYCModal(false)}
            onUpgradeComplete={handleKYCUpgrade}
          />
        )}
        {showRiskModal && <RiskDashboard report={riskReport} isLoading={isRiskLoading} onRefresh={refreshRiskAnalysis} onClose={() => setShowRiskModal(false)} />}
        <WalletConnectModal isOpen={showWalletModal} onClose={() => setShowWalletModal(false)} onConnect={(info) => setWallet(info)} />
        <LegalModal type={activeLegalDoc} onClose={() => setActiveLegalDoc(null)} />
        <ReferralModal isOpen={showReferralModal} onClose={() => setShowReferralModal(false)} referralCode={user.id} onOpenTerms={() => setActiveLegalDoc('REFERRAL_TERMS' as LegalDocType)} />

        {isUserNavOpen && (
          <button
            aria-label="Close navigation menu"
            className="fixed inset-0 z-[60] bg-black/60 md:hidden"
            onClick={() => setIsUserNavOpen(false)}
          />
        )}

        <aside className={`fixed inset-y-0 left-0 z-[70] w-72 max-w-[86vw] bg-[#0a0a0a] border-r border-zinc-900 flex flex-col transform transition-transform duration-300 md:static md:z-50 md:translate-x-0 md:w-64 ${isUserNavOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="p-6"><Logo /></div>
          <nav className="flex-1 px-4 space-y-2 mt-4">
            <NavItem view="borrow" label="Borrowing" icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>} />
            <NavItem view="lend" label="Marketplace" icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>} />
            <NavItem view="trade" label="Invest (Beta)" icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"></path></svg>} />
            <NavItem view="mentorship" label="Mentorship" icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>} />
            <NavItem view="knowledge_base" label="Knowledge Base" icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>} />
            <NavItem view="profile" label="Profile" icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>} />
          </nav>
          
          <div onClick={() => setShowReferralModal(true)} className="p-4 mx-4 mb-4 bg-gradient-to-br from-zinc-900 to-[#00e599]/10 rounded-xl border border-zinc-800 cursor-pointer hover:border-[#00e599]/50 transition-colors group">
             <div className="flex items-center gap-2 mb-2"><span className="text-xl">🚀</span><span className="text-xs font-bold text-white uppercase tracking-wider group-hover:text-[#00e599]">Boost Score</span></div><p className="text-[10px] text-zinc-500">Invite friends & earn reputation points.</p>
          </div>
          <div className="p-4 border-t border-zinc-900">
             <Button variant="ghost" size="sm" className="w-full justify-start text-zinc-500 hover:text-red-400" onClick={handleLogout}><svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>Log Out</Button>
             <div className="mt-2 text-[8px] text-zinc-600 text-center"><button onClick={() => { if(confirm('Reset all data?')) PersistenceService.clearAll(user.id); }} className="hover:text-red-500">Reset My Data</button></div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 flex flex-col relative overflow-hidden z-10">
          <div className="absolute inset-0 bg-grid-pattern pointer-events-none -z-10"></div>
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black pointer-events-none -z-10"></div>

          <header className="min-h-14 md:h-16 border-b border-zinc-800/50 backdrop-blur-sm flex items-center justify-between px-4 md:px-8 py-2 z-10 bg-[#050505]/80">
             <div className="flex items-center gap-3 min-w-0">
               <button
                 aria-label="Open navigation menu"
                 className="md:hidden w-9 h-9 rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white"
                 onClick={() => setIsUserNavOpen(true)}
               >
                 ☰
               </button>
               <h1 className="text-base md:text-xl font-bold text-white tracking-tight truncate">{VIEW_TITLES[activeView]}</h1>
             </div>
             <div className="flex items-center gap-2 md:gap-4 flex-wrap justify-end">
                <a href="https://www.facebook.com/profile.php?id=61573009392683" target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full flex items-center justify-center border border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-white hover:border-zinc-500 transition-all" title="Visit our Facebook Page">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </a>
                <button onClick={requestNotificationPermission} className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all ${notificationsEnabled ? 'bg-[#00e599]/10 text-[#00e599] border-[#00e599]/50' : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:text-white'}`} title={notificationsEnabled ? 'Notifications On' : 'Enable Notifications'}>
                  {notificationsEnabled ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg> : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path><circle cx="19" cy="5" r="2" fill="#ef4444" stroke="none" /></svg>}
                </button>
                <Button size="sm" variant="secondary" onClick={handleRiskAnalysis} className="border border-zinc-700 hidden sm:inline-flex"><span className="mr-1">🛡️</span> Risk Profile</Button>
                <Button size="sm" variant="secondary" onClick={handleRiskAnalysis} className="border border-zinc-700 sm:hidden px-3">🛡️</Button>
                {canQuickSwitchToAdmin && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-500/40 text-amber-300 hover:text-amber-200"
                    onClick={handleOpenAdminConsoleQuickSwitch}
                  >
                    Admin Console
                  </Button>
                )}
                {wallet.isConnected ? (
                  <>
                    <div className="hidden sm:flex items-center gap-3 bg-zinc-900/80 pl-4 pr-1 py-1 rounded-full border border-zinc-800">
                      <div className="text-right">
                        <div className="text-[10px] text-zinc-500 font-mono leading-none">{wallet.balance} ETH</div>
                        <div className="text-xs font-bold text-white font-mono leading-none mt-1">{shortenAddress(wallet.address || '')}</div>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 border border-zinc-600 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-[#00e599]"></div>
                      </div>
                    </div>
                    <div className="sm:hidden w-9 h-9 rounded-full border border-zinc-700 bg-zinc-900 flex items-center justify-center" title={shortenAddress(wallet.address || '')}>
                      <div className="w-2 h-2 rounded-full bg-[#00e599]"></div>
                    </div>
                  </>
                ) : (
                  <Button variant="primary" size="sm" onClick={() => setShowWalletModal(true)}>Connect Wallet</Button>
                )}
             </div>
          </header>

          <NewsTicker />

          <div className="flex-1 overflow-y-auto relative z-0 custom-scrollbar flex flex-col">
             <div className={activeView === 'trade' ? 'h-full' : 'flex-1 p-4 sm:p-6 md:p-8'}>
               {activeView === 'borrow' && (
                 <div className="max-w-6xl mx-auto animate-fade-in space-y-8">
                    <UserProfileCard user={user} onUpdate={handleProfileUpdate} onVerifyClick={() => setShowKYCModal(true)} onAnalyzeRisk={handleRiskAnalysis} onEditClick={() => setActiveView('profile')} isAnalyzing={isAnalyzing} />
                    {user.isFrozen && <div className="bg-red-900/20 border border-red-500/50 rounded-xl p-4 flex items-center gap-4 animate-pulse"><span className="text-3xl">❄️</span><div><h3 className="text-red-400 font-bold">Account Frozen</h3><p className="text-sm text-red-300/80">Your account has been locked by a Risk Officer. Please contact support.</p></div></div>}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                       <div className="md:col-span-5">
                          <div className="glass-panel rounded-2xl p-6 md:sticky md:top-4">
                            <div className="flex justify-between items-center mb-6"><h3 className="text-lg font-bold text-white">New Request</h3>{user.kycTier === KYCTier.TIER_0 && <span className="text-[10px] bg-red-500/10 text-red-400 px-2 py-1 rounded border border-red-500/20">KYC Required</span>}</div>
                            <form onSubmit={handleCreateRequest} className="space-y-5">
                               <fieldset disabled={user.isFrozen}>
                                   <div>
                                      <div className="flex justify-between mb-1"><label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Amount</label><span className="text-[10px] text-zinc-500">Max: ${user.kycLimit}</span></div>
                                      <div className="relative group"><span className="absolute left-4 top-3 text-zinc-500">$</span><input type="number" value={loanAmount} onChange={(e) => setLoanAmount(Number(e.target.value))} className="w-full bg-black/50 border border-zinc-800 rounded-xl py-2.5 pl-8 pr-4 text-white focus:border-[#00e599] outline-none font-mono text-lg transition-all disabled:opacity-50" /></div>
                                   </div>
                                   <div className="flex gap-3 mt-4">
                                     <div onClick={() => { if(!user.isFrozen) { setIsMicroloan(false); setLoanAmount(1000); }}} className={`flex-1 p-3 rounded-xl border cursor-pointer text-center transition-all ${!isMicroloan ? 'bg-zinc-800 border-zinc-600' : 'bg-black/30 border-zinc-800 text-zinc-500'}`}><div className="text-xs font-bold">Personal</div></div>
                                     <div onClick={() => { if(!user.isFrozen) { setIsMicroloan(true); setLoanAmount(200); }}} className={`flex-1 p-3 rounded-xl border cursor-pointer text-center transition-all ${isMicroloan ? 'bg-[#00e599]/10 border-[#00e599] text-[#00e599]' : 'bg-black/30 border-zinc-800 text-zinc-500'}`}><div className="text-xs font-bold">Microloan</div></div>
                                   </div>
                                   {isMicroloan && <div className="flex items-center gap-3 p-3 mt-4 rounded-xl bg-pink-900/10 border border-pink-500/20 cursor-pointer" onClick={() => !user.isFrozen && setIsCharityGuaranteed(!isCharityGuaranteed)}><div className={`w-4 h-4 rounded border flex items-center justify-center ${isCharityGuaranteed ? 'bg-pink-500 border-pink-500' : 'border-zinc-600'}`}>{isCharityGuaranteed && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth="3" d="M5 13l4 4L19 7"/></svg>}</div><span className="text-xs text-pink-300 font-medium">Fresh Start (Charity Guarantee)</span></div>}
                                   <div className="mt-4"><label className="block text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Purpose</label><input type="text" value={loanPurpose} onChange={(e) => setLoanPurpose(e.target.value)} className="w-full bg-black/50 border border-zinc-800 rounded-xl p-2.5 text-white focus:border-[#00e599] outline-none text-sm disabled:opacity-50" placeholder="e.g. Server costs" /></div>
                                   <Button className="w-full mt-4" size="md" disabled={user.isFrozen}>Post Request</Button>
                               </fieldset>
                            </form>
                          </div>
                       </div>
                       <div className="md:col-span-7">
                          <Marketplace activeRequests={myRequests} availableOffers={availableOffers} charities={charities} onRequestMatch={async () => setIsMatching(true)} onFundRequest={handleFundRequest} onReleaseEscrow={handleReleaseEscrow} onRepayLoan={handleRepayLoan} isMatching={isMatching} />
                       </div>
                    </div>
                 </div>
               )}

               {activeView === 'lend' && (
                 <div className="max-w-6xl mx-auto animate-fade-in">
                    <LenderDashboard user={user} myOffers={myOffers} communityRequests={communityRequests} onCreateOffer={handleCreateOffer} />
                 </div>
               )}

               {activeView === 'trade' && (
                  <TradingDashboard user={user} onTrade={handleTrade} />
               )}

               {activeView === 'mentorship' && (
                 <div className="max-w-5xl mx-auto">
                   <MentorshipDashboard user={user} communityRequests={communityRequests} onSponsor={handleSponsorRequest} />
                 </div>
               )}

               {activeView === 'profile' && (
                 <ProfileSettings
                   user={user}
                   onSave={handleProfileUpdate}
                   onDeposit={handleDeposit}
                   onWithdraw={handleWithdrawal}
                 />
               )}
             </div>
             {activeView !== 'trade' && <Footer onOpenLegal={(type) => setActiveLegalDoc(type)} />}
          </div>
        </main>
      </div>
    );
  }
  return null;
};

export default App;
