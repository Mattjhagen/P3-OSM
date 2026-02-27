/**
 * Fetches deterministic user reputation features.
 * Primary source is rep_features_user view with fallback to base tables.
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

export async function resolveUserFeatures(options: FetchScoreInputOptions): Promise<ScoreInput | null> {
  const userId = await resolveUserId(options);
  if (!userId) return null;

  // Primary path: deterministic feature view.
  const fromView = await supabase
    .from('rep_features_user')
    .select(
      'user_id, kyc_level, account_age_days, on_time_rate_180d, late_count_30d, repayment_count_total, default_ever, default_in_last_90d, active_loan_count, utilization_ratio'
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (fromView.data) {
    const row = fromView.data as Record<string, unknown>;
    const utilizationRaw = row.utilization_ratio;
    return {
      userId,
      kycLevel: Number(row.kyc_level ?? 0),
      accountAgeDays: Number(row.account_age_days ?? 0),
      onTimeRate180d: Number(row.on_time_rate_180d ?? 1),
      lateCount30d: Number(row.late_count_30d ?? 0),
      repaymentCountTotal: Number(row.repayment_count_total ?? 0),
      defaultEver: Boolean(row.default_ever ?? false),
      defaultInLast90d: Boolean(row.default_in_last_90d ?? false),
      activeLoanCount: Number(row.active_loan_count ?? 0),
      utilizationRatio:
        utilizationRaw == null ? null : Number.isFinite(Number(utilizationRaw)) ? Number(utilizationRaw) : null,
      capacitySignalsMissing: utilizationRaw == null,
    };
  }

  // Fallback path for environments where the view has not been migrated yet.
  const [userRow, loansRes] = await Promise.all([
    supabase.from('users').select('created_at, kyc_tier').eq('id', userId).maybeSingle(),
    supabase.from('loan_activity').select('id, status, created_at').eq('borrower_id', userId),
  ]);

  const loansData = loansRes.data ?? [];
  const loanIds = loansData.map((l) => l.id);
  let repaymentsData: { loan_id: string; is_late: boolean; created_at: string }[] = [];
  if (loanIds.length > 0) {
    const repaymentsRes = await supabase
      .from('repayment_history')
      .select('loan_id, is_late, created_at')
      .in('loan_id', loanIds);
    repaymentsData = (repaymentsRes.data ?? []) as { loan_id: string; is_late: boolean; created_at: string }[];
  }

  const now = Date.now();
  const accountCreated = userRow.data?.created_at ? new Date(userRow.data.created_at).getTime() : now;
  const accountAgeDays = Math.max(0, Math.floor((now - accountCreated) / (24 * 60 * 60 * 1000)));

  const totalRepayments = repaymentsData.length;
  const onTimeCount = repaymentsData.filter((r) => !r.is_late).length;
  const onTimeRate180d = totalRepayments > 0 ? onTimeCount / totalRepayments : 1;
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const lateCount30d = repaymentsData.filter((r) => r.is_late && (r.created_at ?? '') >= thirtyDaysAgo).length;

  const defaultEver = loansData.some((l) => ['defaulted', 'default'].includes(String(l.status).toLowerCase()));
  const ninetyDaysAgo = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();
  const defaultInLast90d = loansData.some(
    (l) =>
      ['defaulted', 'default'].includes(String(l.status).toLowerCase()) &&
      (l.created_at ?? '') >= ninetyDaysAgo
  );
  const activeLoanCount = loansData.filter((l) =>
    ['active', 'funded', 'in_progress'].includes(String(l.status).toLowerCase())
  ).length;

  return {
    userId,
    kycLevel: Number(userRow.data?.kyc_tier ?? 0),
    accountAgeDays,
    onTimeRate180d,
    lateCount30d,
    repaymentCountTotal: totalRepayments,
    defaultEver,
    defaultInLast90d,
    activeLoanCount,
    utilizationRatio: null,
    capacitySignalsMissing: true,
  };
}

// Backward-compatible exported name used by routes.
export const fetchScoreInput = resolveUserFeatures;
