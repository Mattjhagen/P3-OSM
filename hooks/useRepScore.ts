// hooks/useRepScore.ts
// AI Reputation Scoring Hook – v2.0 (explainable edition)
// Goal: Make "trust" transparent, not magic. Show users why they got 78%.
// Uses: wallet history, social links, on-chain activity, dispute logs.
// Outputs: score (0-100), breakdown array, confidence %

import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const CACHE_TTL_MS = 60_000; // 1 min – avoids redundant fetches when switching wallets

interface RepBreakdown {
  signal: string;
  weight: number;      // 0-1, how much it matters
  value: number;       // raw contribution (e.g., 0.85 for "no disputes")
  display: string;     // "No disputes in 6 months"
}

interface RepScore {
  score: number;
  breakdown: RepBreakdown[];
  confidence: number;  // 0-1, how reliable this calc is
  lastUpdated: string;
}

interface CacheEntry {
  data: RepScore;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

function computeScore(userData: {
  social_links?: Record<string, unknown>;
  disputes?: unknown[];
  onchain_activity?: { firstTx?: number; txCountLast30?: number };
}): RepScore {
  const signals: RepBreakdown[] = [];
  const onchain = userData.onchain_activity ?? {};
  const firstTx = onchain.firstTx ?? 0;
  const walletAgeDays = (Date.now() - firstTx) / MS_PER_DAY;

  signals.push({
    signal: 'Wallet Age',
    weight: 0.25,
    value: Math.min(1, walletAgeDays / 365),
    display: `Wallet active for ${Math.floor(walletAgeDays)} days`
  });

  const disputeCount = userData.disputes?.length ?? 0;
  signals.push({
    signal: 'Disputes',
    weight: 0.30,
    value: disputeCount === 0 ? 1 : Math.max(0, 1 - disputeCount * 0.2),
    display: disputeCount === 0 ? 'No disputes' : `${disputeCount} dispute${disputeCount > 1 ? 's' : ''}`
  });

  const verifiedLinks = Object.values(userData.social_links ?? {}).filter(Boolean).length;
  signals.push({
    signal: 'Social Proof',
    weight: 0.25,
    value: Math.min(1, verifiedLinks / 3),
    display: `${verifiedLinks}/3 socials verified`
  });

  const recentTxCount = onchain.txCountLast30 ?? 0;
  signals.push({
    signal: 'Recent Activity',
    weight: 0.20,
    value: Math.min(1, recentTxCount / 10),
    display: `${recentTxCount} txs in last 30 days`
  });

  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
  const rawScore = signals.reduce((sum, s) => sum + s.value * s.weight, 0) / totalWeight;
  const dataPoints = signals.filter(s => s.value > 0).length;
  const confidence = Math.min(1, dataPoints / signals.length);

  return {
    score: Math.round(rawScore * 100),
    breakdown: signals,
    confidence,
    lastUpdated: new Date().toISOString()
  };
}

export const useRepScore = (walletAddress: string | null) => {
  const [score, setScore] = useState<RepScore | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!walletAddress) {
      setScore(null);
      setError(null);
      return;
    }

    let cancelled = false;
    const key = walletAddress.toLowerCase();
    const cached = cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      setScore(cached.data);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const run = async () => {
      try {
        const { data: userData, error: dbError } = await supabase
          .from('user_profiles')
          .select('social_links, disputes, onchain_activity')
          .eq('wallet_address', key)
          .single();

        if (cancelled) return;
        if (dbError) throw dbError;
        if (!userData) throw new Error('No profile found');

        const result = computeScore(userData);
        cache.set(key, { data: result, fetchedAt: Date.now() });
        setScore(result);
        setError(null);
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message ?? 'Failed to load score');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  return { score, loading, error };
};
