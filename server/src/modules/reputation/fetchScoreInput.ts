/**
 * Fetches and normalizes score inputs from Supabase (transaction/repayment/engagement).
 * Optional Gemini enrichment behind feature flag (TODO stub).
 */

import { supabase } from '../../config/supabase';
import type { ScoreInput } from './types';

const trim = (x: unknown) => (typeof x === 'string' ? x.trim() : '');

export interface FetchScoreInputOptions {
  userId?: string;
  walletAddress?: string;
}

/**
 * Resolve user ID from wallet address if needed.
 */
async function resolveUserId(options: FetchScoreInputOptions): Promise<string | null> {
  if (options.userId) return options.userId;
  if (!options.walletAddress) return null;

  const { data, error } = await supabase
    .from('users')
    .select('id')
    .ilike('wallet_address', trim(options.walletAddress))
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  return data.id;
}

/**
 * Fetch and build ScoreInput for a user (by id or wallet).
 */
export async function fetchScoreInput(options: FetchScoreInputOptions): Promise<ScoreInput | null> {
  const userId = await resolveUserId(options);
  if (!userId) return null;

  const [userRow, loansRes, snapshots, fraudRows] = await Promise.all([
    supabase.from('users').select('created_at').eq('id', userId).maybeSingle(),
    supabase
      .from('loan_activity')
      .select('id, amount_usd, status, created_at')
      .or(`borrower_id.eq.${userId},lender_id.eq.${userId}`),
    supabase
      .from('trust_score_snapshots')
      .select('score, snapshot_time')
      .eq('user_id', userId)
      .order('snapshot_time', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('fraud_flags').select('id').eq('user_id', userId).eq('is_active', true),
  ]);

  const loansData = loansRes.data ?? [];
  const loanIds = loansData.map((l) => l.id);
  let repaymentsData: { loan_id: string; is_late: boolean }[] = [];
  if (loanIds.length > 0) {
    const repaymentsRes = await supabase
      .from('repayment_history')
      .select('loan_id, is_late')
      .in('loan_id', loanIds);
    repaymentsData = repaymentsRes.data ?? [];
  }
  const now = Date.now();
  const accountCreated = userRow.data?.created_at ? new Date(userRow.data.created_at).getTime() : now;
  const accountAgeDays = Math.max(0, Math.floor((now - accountCreated) / (24 * 60 * 60 * 1000)));

  const totalRepayments = repaymentsData.length;
  const onTimeCount = repaymentsData.filter((r) => !r.is_late).length;
  const repaymentOnTimePct = totalRepayments > 0 ? onTimeCount / totalRepayments : 1;

  const defaultedLoans = loansData.filter((l) => String(l.status).toLowerCase() === 'defaulted').length;
  const delinquentRepayments = repaymentsData.filter((r) => r.is_late).length;

  const transactionVolumeUsd = loansData.reduce((sum, l) => sum + Number(l.amount_usd ?? 0), 0);
  const ninetyDaysAgo = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();
  const recentCount = loansData.filter((l) => (l.created_at ?? '') >= ninetyDaysAgo).length;
  const recencyWeight = loansData.length > 0 ? Math.min(1, recentCount / Math.max(1, loansData.length)) : 0;

  const verificationStepsCompleted = 0; // TODO: from KYC/verification tables if exposed
  const riskFlagsCount = (fraudRows.data ?? []).length;

  return {
    userId,
    repaymentOnTimePct,
    defaultsCount: defaultedLoans,
    delinquenciesCount: delinquentRepayments,
    transactionVolumeCount: loansData.length + repaymentsData.length,
    transactionVolumeUsd,
    recencyWeight,
    verificationStepsCompleted,
    accountAgeDays,
    riskFlagsCount,
    ...(snapshots.data ? { geminiVerification: {} } : {}), // placeholder for optional enrichment
  };
}
