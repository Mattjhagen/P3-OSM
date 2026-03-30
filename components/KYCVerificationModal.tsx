import React from 'react';
import { KYCTier } from '../types';
import { VerifyIdentity } from './VerifyIdentity';

interface Props {
  currentTier: KYCTier;
  userId: string;
  userEmail?: string;
  onClose: () => void;
  onUpgradeComplete: (newTier: KYCTier, limit: number, docData?: any) => void;
}

export const KYCVerificationModal: React.FC<Props> = ({
  userId,
  onClose,
  onUpgradeComplete,
}) => {
  const handleComplete = (data: any) => {
    // Logic to determine new tier based on Idswyft result
    const newTier = data.final_result === 'verified' ? KYCTier.TIER_2 : KYCTier.TIER_1;
    const limit = newTier === KYCTier.TIER_2 ? 50000 : 1000;
    onUpgradeComplete(newTier, limit, data);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[100] p-4">
      <div className="relative max-w-lg w-full">
        <button 
          onClick={onClose} 
          className="absolute -top-12 right-0 text-zinc-500 hover:text-white transition-colors p-2"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <VerifyIdentity 
          userId={userId} 
          onComplete={handleComplete} 
          onCancel={onClose} 
        />
      </div>
    </div>
  );
};
