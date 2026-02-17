
import React, { useEffect, useState, useRef } from 'react';
import { UserProfile } from '../types';
import { Button } from './Button';
import { ComplianceService, DisclosureSummaryDto, StatementSummaryDto } from '../services/complianceService';
import { FeatureFlagService } from '../services/featureFlagService';
import { PlaidLinkService } from '../services/plaidLinkService';

interface Props {
  user: UserProfile;
  onSave: (updatedUser: UserProfile) => void;
  onDeposit: (amount: number) => Promise<void>;
  onWithdraw: (amount: number, method: 'STRIPE' | 'BTC', destination: string) => Promise<void>;
}

export const ProfileSettings: React.FC<Props> = ({ user, onSave, onDeposit, onWithdraw }) => {
  const [formData, setFormData] = useState(user);
  const [isSaving, setIsSaving] = useState(false);
  const [depositAmount, setDepositAmount] = useState(100);
  const [isDepositing, setIsDepositing] = useState(false);
  const [depositError, setDepositError] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState(50);
  const [withdrawMethod, setWithdrawMethod] = useState<'STRIPE' | 'BTC'>('STRIPE');
  const [withdrawDestination, setWithdrawDestination] = useState('');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');
  const [isLinkingBank, setIsLinkingBank] = useState(false);
  const [bankLinkStatus, setBankLinkStatus] = useState('');
  const [statements, setStatements] = useState<StatementSummaryDto[]>([]);
  const [disclosures, setDisclosures] = useState<DisclosureSummaryDto[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    const loadDocuments = async () => {
      if (!FeatureFlagService.isEnabled('ENABLE_STATEMENT_DOWNLOADS')) {
        if (!cancelled) {
          setStatements([]);
          setDisclosures([]);
        }
        return;
      }

      setDocumentsLoading(true);
      setDocumentsError('');
      try {
        const [statementRows, disclosureRows] = await Promise.all([
          ComplianceService.listStatements({ userId: user.id, limit: 24 }),
          ComplianceService.listSignedDisclosures({ userId: user.id, limit: 24 }),
        ]);

        if (!cancelled) {
          setStatements(statementRows);
          setDisclosures(disclosureRows);
        }
      } catch (error: any) {
        if (!cancelled) {
          setDocumentsError(error?.message || 'Documents are temporarily unavailable.');
        }
      } finally {
        if (!cancelled) {
          setDocumentsLoading(false);
        }
      }
    };

    loadDocuments();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  useEffect(() => {
    let cancelled = false;

    const resumePlaidOAuthIfNeeded = async () => {
      if (!PlaidLinkService.hasPendingOAuthRedirect()) return;
      setIsLinkingBank(true);
      setBankLinkStatus('');

      try {
        const result = await PlaidLinkService.resumeOAuthRedirect({ userId: user.id });
        if (cancelled || !result) return;
        const institution = String(result?.institutionName || 'institution');
        const mask = String(result?.mask || '****');
        setBankLinkStatus(`Bank account linked (${institution} • ${mask}).`);
      } catch (error: any) {
        if (!cancelled) {
          setBankLinkStatus(error?.message || 'Plaid OAuth resume failed.');
        }
      } finally {
        if (!cancelled) {
          setIsLinkingBank(false);
        }
      }
    };

    resumePlaidOAuthIfNeeded();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const handleChange = (field: keyof UserProfile, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, avatarUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 800));
    onSave(formData);
    setIsSaving(false);
  };

  const handleDownloadStatement = async (statementId: string) => {
    try {
      await ComplianceService.downloadStatement({ statementId, userId: user.id });
    } catch (error: any) {
      setDocumentsError(error?.message || 'Failed to download statement.');
    }
  };

  const handleDownloadDisclosure = async (disclosureId: string) => {
    try {
      await ComplianceService.downloadSignedDisclosure({ disclosureId, userId: user.id });
    } catch (error: any) {
      setDocumentsError(error?.message || 'Failed to download signed disclosure.');
    }
  };

  const handleDeposit = async () => {
    setDepositError('');
    const amount = Number(depositAmount);
    if (!Number.isFinite(amount) || amount < 1) {
      setDepositError('Enter a valid deposit amount of at least $1.');
      return;
    }

    setIsDepositing(true);
    try {
      await onDeposit(amount);
    } catch (error: any) {
      setDepositError(error?.message || 'Deposit checkout could not be started.');
    } finally {
      setIsDepositing(false);
    }
  };

  const handleWithdrawal = async () => {
    setWithdrawError('');
    const amount = Number(withdrawAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setWithdrawError('Enter a valid withdrawal amount greater than $0.');
      return;
    }

    if (!withdrawDestination.trim()) {
      setWithdrawError(withdrawMethod === 'BTC' ? 'Enter a BTC destination address.' : 'Enter a Stripe connected account id.');
      return;
    }

    setIsWithdrawing(true);
    try {
      await onWithdraw(amount, withdrawMethod, withdrawDestination.trim());
      setWithdrawAmount(50);
      setWithdrawDestination('');
    } catch (error: any) {
      setWithdrawError(error?.message || 'Withdrawal could not be processed.');
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleLinkBankWithPlaid = async () => {
    setBankLinkStatus('');
    setIsLinkingBank(true);
    try {
      const result = await PlaidLinkService.openLink({
        userId: user.id,
        email: user.email || '',
      });
      const institution = String(result?.institutionName || 'institution');
      const mask = String(result?.mask || '****');
      setBankLinkStatus(`Bank account linked (${institution} • ${mask}).`);
    } catch (error: any) {
      setBankLinkStatus(error?.message || 'Plaid bank linking did not complete.');
    } finally {
      setIsLinkingBank(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto animate-fade-in space-y-8 pb-10">
      
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold text-white tracking-tight">Profile Settings</h2>
        <p className="text-zinc-500 mt-1">Manage your identity, appearance, and personal details.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        
        {/* Avatar Section */}
        <div className="glass-panel p-8 rounded-2xl flex flex-col md:flex-row items-center gap-8 border border-zinc-800/50">
          <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <div className="w-32 h-32 rounded-full overflow-hidden border-2 border-zinc-700 group-hover:border-[#00e599] transition-all relative">
              {formData.avatarUrl ? (
                <img src={formData.avatarUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-zinc-600">
                  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                </div>
              )}
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-xs font-bold text-white uppercase tracking-wider">Change</span>
              </div>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*"
              onChange={handleImageUpload}
            />
          </div>
          
          <div className="text-center md:text-left">
            <h3 className="text-lg font-bold text-white">Profile Picture</h3>
            <p className="text-sm text-zinc-400 mt-1 max-w-xs mb-4">
              Upload a high-resolution image to build trust with lenders.
            </p>
            <div className="flex gap-3 justify-center md:justify-start">
               <Button type="button" size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()}>
                 Upload New
               </Button>
               {formData.avatarUrl && (
                 <Button type="button" size="sm" variant="ghost" onClick={() => setFormData({...formData, avatarUrl: undefined})}>
                   Remove
                 </Button>
               )}
            </div>
          </div>
        </div>

        {/* Documents & Statements Section */}
        <div className="glass-panel p-8 rounded-2xl space-y-6 border border-zinc-800/50">
          <h3 className="text-lg font-bold text-white border-b border-zinc-800 pb-4 mb-6">
            Documents & Statements
          </h3>

          {!FeatureFlagService.isEnabled('ENABLE_STATEMENT_DOWNLOADS') && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 text-xs text-zinc-500">
              Statement and disclosure downloads are disabled by BETA feature flags.
            </div>
          )}

          {documentsError && (
            <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-xs text-red-300">
              {documentsError}
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white">Generated Statements</h4>
              {documentsLoading && <span className="text-[11px] text-zinc-500">Loading...</span>}
            </div>

            {statements.length === 0 && !documentsLoading ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 text-xs text-zinc-500">
                No statements are available yet. Monthly statements are generated after each month closes.
              </div>
            ) : (
              statements.map((statement) => (
                <div
                  key={statement.id}
                  className="flex items-center justify-between p-4 bg-zinc-900/50 rounded-xl border border-zinc-800 hover:border-[#00e599]/30 transition-colors"
                >
                  <div>
                    <h5 className="text-white font-bold text-sm">
                      {statement.statementType === 'YEARLY_TAX'
                        ? `Yearly Tax Statement (${statement.periodStart.slice(0, 4)})`
                        : `Monthly Statement (${statement.periodStart.slice(0, 7)})`}
                    </h5>
                    <p className="text-xs text-zinc-500">
                      {statement.periodStart} to {statement.periodEnd} • Closing ${statement.closingBalanceUsd.toFixed(2)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownloadStatement(statement.id)}
                    disabled={!FeatureFlagService.isEnabled('ENABLE_STATEMENT_DOWNLOADS')}
                  >
                    Download
                  </Button>
                </div>
              ))
            )}
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-bold text-white">Signed Disclosures</h4>
            {disclosures.length === 0 && !documentsLoading ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 text-xs text-zinc-500">
                No signed disclosures yet. They appear after you apply for feature access.
              </div>
            ) : (
              disclosures.map((disclosure) => (
                <div
                  key={disclosure.id}
                  className="flex items-center justify-between p-4 bg-zinc-900/40 rounded-xl border border-zinc-800"
                >
                  <div>
                    <h5 className="text-white font-bold text-sm">
                      {disclosure.featureKey.replace(/_/g, ' ')} • {disclosure.decision.toUpperCase()}
                    </h5>
                    <p className="text-xs text-zinc-500">
                      Signed {new Date(disclosure.acceptedAt).toLocaleString()} • Version {disclosure.tosVersion}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownloadDisclosure(disclosure.id)}
                    disabled={!FeatureFlagService.isEnabled('ENABLE_STATEMENT_DOWNLOADS')}
                  >
                    Download
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Deposit Funds Section */}
        <div className="glass-panel p-8 rounded-2xl space-y-6 border border-zinc-800/50">
           <div className="flex justify-between items-center border-b border-zinc-800 pb-4 mb-6">
             <h3 className="text-lg font-bold text-white">Wallet & Funds</h3>
             <span className="text-sm text-[#00e599] font-mono">Current Balance: ${formData.balance}</span>
           </div>
           
           <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800">
             <label className="block text-xs text-zinc-500 uppercase tracking-wider font-bold mb-2">
               Deposit Amount (USD)
             </label>
             <div className="flex gap-4">
               <input 
                 type="number" 
                 min={1}
                 value={depositAmount}
                 onChange={(e) => setDepositAmount(Number(e.target.value))}
                 className="flex-1 bg-black border border-zinc-800 rounded-xl p-3 text-white focus:border-[#00e599] outline-none transition-colors"
               />
               <Button
                 type="button"
                 variant="primary"
                 onClick={handleDeposit}
                 isLoading={isDepositing}
               >
                 Add Funds
               </Button>
             </div>
             {depositError && (
               <p className="text-[11px] text-red-400 mt-2">{depositError}</p>
             )}
             <p className="text-[10px] text-zinc-500 mt-2">
               Deposits are processed through Stripe Checkout. If the backend is unavailable, this action will fail safely and no funds are simulated.
             </p>
           </div>

           <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800">
             <label className="block text-xs text-zinc-500 uppercase tracking-wider font-bold mb-2">
               Withdraw Funds
             </label>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
               <input
                 type="number"
                 min={1}
                 value={withdrawAmount}
                 onChange={(e) => setWithdrawAmount(Number(e.target.value))}
                 className="bg-black border border-zinc-800 rounded-xl p-3 text-white focus:border-[#00e599] outline-none transition-colors"
                 placeholder="Amount (USD)"
               />
               <select
                 value={withdrawMethod}
                 onChange={(e) => setWithdrawMethod(e.target.value === 'BTC' ? 'BTC' : 'STRIPE')}
                 className="bg-black border border-zinc-800 rounded-xl p-3 text-white focus:border-[#00e599] outline-none transition-colors"
               >
                 <option value="STRIPE">Stripe (Connected Acct)</option>
                 <option value="BTC">BTC Wallet</option>
               </select>
               <input
                 type="text"
                 value={withdrawDestination}
                 onChange={(e) => setWithdrawDestination(e.target.value)}
                 className="bg-black border border-zinc-800 rounded-xl p-3 text-white focus:border-[#00e599] outline-none transition-colors"
                 placeholder={withdrawMethod === 'BTC' ? 'BTC address (bc1...)' : 'acct_...'}
               />
             </div>
             <div className="mt-3">
               <Button
                 type="button"
                 variant="secondary"
                 onClick={handleWithdrawal}
                 isLoading={isWithdrawing}
               >
                 Withdraw
               </Button>
             </div>
             {withdrawError && (
               <p className="text-[11px] text-red-400 mt-2">{withdrawError}</p>
             )}
             <p className="text-[10px] text-zinc-500 mt-2">
               Withdrawal fee: $3 + 3% of amount. BTC withdrawals execute only when BTC provider is configured. Stripe withdrawals require Stripe Connect payouts.
             </p>
           </div>

           <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800">
             <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
               <div>
                 <label className="block text-xs text-zinc-500 uppercase tracking-wider font-bold mb-1">
                   Link Bank Account (Plaid)
                 </label>
                 <p className="text-[10px] text-zinc-500">
                   OAuth institutions redirect through <code>/oauth.html</code> and return to P3 automatically.
                 </p>
               </div>
               <Button
                 type="button"
                 variant="outline"
                 onClick={handleLinkBankWithPlaid}
                 isLoading={isLinkingBank}
               >
                 Link Bank
               </Button>
             </div>
             {bankLinkStatus && (
               <p className="text-[11px] text-zinc-300 mt-3">{bankLinkStatus}</p>
             )}
           </div>
        </div>

        {/* Details Section */}
        <div className="glass-panel p-8 rounded-2xl space-y-6 border border-zinc-800/50">
           <h3 className="text-lg font-bold text-white border-b border-zinc-800 pb-4 mb-6">Personal Information</h3>
           
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div>
               <label className="block text-xs text-zinc-500 uppercase tracking-wider font-bold mb-2">Display Name</label>
               <input 
                 type="text" 
                 value={formData.name}
                 onChange={e => handleChange('name', e.target.value)}
                 className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-white focus:border-[#00e599] outline-none transition-colors"
               />
             </div>
             <div>
               <label className="block text-xs text-zinc-500 uppercase tracking-wider font-bold mb-2">Employment Title</label>
               <input 
                 type="text" 
                 value={formData.employmentStatus}
                 onChange={e => handleChange('employmentStatus', e.target.value)}
                 className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-white focus:border-[#00e599] outline-none transition-colors"
               />
             </div>
             <div>
               <label className="block text-xs text-zinc-500 uppercase tracking-wider font-bold mb-2">Annual Income ($)</label>
               <input 
                 type="number" 
                 value={formData.income}
                 onChange={e => handleChange('income', parseInt(e.target.value))}
                 className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-white focus:border-[#00e599] outline-none transition-colors"
               />
             </div>
             <div>
               <label className="block text-xs text-zinc-500 uppercase tracking-wider font-bold mb-2">Wallet Address (Linked)</label>
               <input 
                 type="text" 
                 disabled
                 value="0x71C...9A21" 
                 className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 text-zinc-500 cursor-not-allowed"
               />
             </div>
           </div>

           <div>
              <label className="block text-xs text-zinc-500 uppercase tracking-wider font-bold mb-2">Financial Narrative / Bio</label>
              <textarea 
                rows={4}
                value={formData.financialHistory}
                onChange={e => handleChange('financialHistory', e.target.value)}
                className="w-full bg-black border border-zinc-800 rounded-xl p-3 text-white focus:border-[#00e599] outline-none transition-colors text-sm leading-relaxed"
                placeholder="Explain your financial situation and goals..."
              />
              <p className="text-[10px] text-zinc-500 mt-2">
                This narrative is analyzed by our AI to help determine your reputation score context.
              </p>
           </div>
        </div>

        <div className="flex justify-end gap-4">
           <Button type="button" variant="ghost" onClick={() => setFormData(user)}>Reset Changes</Button>
           <Button type="submit" isLoading={isSaving} className="min-w-[120px]">Save Profile</Button>
        </div>

      </form>
    </div>
  );
};
