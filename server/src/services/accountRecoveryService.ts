import { randomUUID } from 'crypto';
import { supabase } from '../config/supabase';
import logger from '../utils/logger';
import { AdminNotificationService } from './adminNotificationService';
import { FinancePersistenceService } from './financePersistenceService';
import { UserDataService } from './userDataService';

const DEPOSIT_AUDIT_ACTION = 'STRIPE_DEPOSIT_COMPLETED';
const AUTO_REPAY_AUDIT_ACTION = 'AUTO_LOAN_REPAY_FROM_DEPOSIT';

const LARGE_DEPOSIT_THRESHOLD_USD = 10000;
const RAPID_DEPOSIT_WINDOW_MINUTES = 30;
const RAPID_DEPOSIT_COUNT_THRESHOLD = 3;

type DueLoanRow = {
  id: string;
  borrower_id: string;
  lender_id: string | null;
  amount_usd: number | string;
  interest_rate: number | string | null;
  due_date: string | null;
  status: string;
};

export interface DepositRecoveryResult {
  alreadyProcessed: boolean;
  userId: string;
  depositedUsd: number;
  balanceUsd: number;
  deficitBeforeUsd: number;
  remainingDeficitUsd: number;
  autoRepaidLoanCount: number;
  autoRepaidTotalUsd: number;
  reactivated: boolean;
  manualReview: {
    required: boolean;
    ticketId?: string;
    reasons: string[];
    riskTier: number | null;
    activeFraudFlags: number;
  };
}

const roundUsd = (value: number) => Math.round(value * 100) / 100;

const parseUsd = (value: unknown): number => {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return roundUsd(parsed);
};

const isMissingColumn = (message: string, columnName: string) => {
  const normalized = String(message || '').toLowerCase();
  return (
    normalized.includes('column') &&
    normalized.includes(columnName.toLowerCase()) &&
    normalized.includes('does not exist')
  );
};

const isAlreadyProcessed = async (stripeEventId: string) => {
  const { data, error } = await supabase
    .from('audit_log')
    .select('id')
    .eq('action', DEPOSIT_AUDIT_ACTION)
    .eq('metadata->>stripe_event_id', stripeEventId)
    .limit(1);

  if (error) {
    throw new Error(`Failed checking deposit idempotency: ${error.message}`);
  }

  return Array.isArray(data) && data.length > 0;
};

const calculateDueAmountUsd = (loan: DueLoanRow) => {
  const principalUsd = parseUsd(loan.amount_usd);
  const interestRate = Math.max(0, Number(loan.interest_rate || 0));
  const interestUsd = (principalUsd * interestRate) / 100;
  return roundUsd(principalUsd + interestUsd);
};

const listOverdueLoans = async (userId: string): Promise<DueLoanRow[]> => {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('loan_activity')
    .select('id, borrower_id, lender_id, amount_usd, interest_rate, due_date, status')
    .eq('borrower_id', userId)
    .lt('due_date', nowIso)
    .order('due_date', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) {
    if (isMissingColumn(error.message, 'due_date')) {
      return [];
    }
    throw new Error(`Failed to list overdue loans: ${error.message}`);
  }

  return (data || []).filter((loan) => String(loan.status || '').toLowerCase() !== 'repaid');
};

const getDefaultRestrictionState = (profile: Record<string, unknown>) => {
  const accountStatus = String(profile.accountStatus || '').toUpperCase();
  const defaultFlag = Boolean(profile.defaultFlag);
  return defaultFlag || accountStatus === 'DEFAULTED';
};

const assessRiskAndFraud = async (payload: {
  userId: string;
  userEmail?: string;
  depositedUsd: number;
  deficitBeforeUsd: number;
  remainingDeficitUsd: number;
  stripeEventId: string;
  autoRepaidLoanCount: number;
  reactivated: boolean;
}) => {
  const reasons: string[] = [];
  let riskTier: number | null = null;
  let trustScore: number | null = null;
  let activeFraudFlags = 0;

  const { data: snapshot, error: snapshotError } = await supabase
    .from('trust_score_snapshots')
    .select('score, risk_tier, snapshot_time, model_version')
    .eq('user_id', payload.userId)
    .order('snapshot_time', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!snapshotError && snapshot) {
    riskTier = Number.isFinite(Number(snapshot.risk_tier))
      ? Number(snapshot.risk_tier)
      : null;
    trustScore = Number.isFinite(Number(snapshot.score)) ? Number(snapshot.score) : null;
  }

  const { count: activeFraudCount, error: fraudCountError } = await supabase
    .from('fraud_flags')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', payload.userId)
    .eq('is_active', true);

  if (!fraudCountError) {
    activeFraudFlags = activeFraudCount || 0;
  }

  const windowStartIso = new Date(
    Date.now() - RAPID_DEPOSIT_WINDOW_MINUTES * 60 * 1000
  ).toISOString();
  const { count: recentDepositCount, error: recentDepositError } = await supabase
    .from('audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('actor_id', payload.userId)
    .eq('action', DEPOSIT_AUDIT_ACTION)
    .gte('created_at', windowStartIso);

  const normalizedDepositCount = recentDepositError ? 0 : recentDepositCount || 0;

  if (payload.depositedUsd >= LARGE_DEPOSIT_THRESHOLD_USD) {
    reasons.push(`Large deposit detected: $${payload.depositedUsd.toFixed(2)}.`);
  }

  if (normalizedDepositCount >= RAPID_DEPOSIT_COUNT_THRESHOLD) {
    reasons.push(
      `Rapid deposit pattern detected: ${normalizedDepositCount} deposits in ${RAPID_DEPOSIT_WINDOW_MINUTES} minutes.`
    );
  }

  if (activeFraudFlags > 0) {
    reasons.push(`Account already has ${activeFraudFlags} active fraud flag(s).`);
  }

  if (riskTier !== null && riskTier >= 2) {
    reasons.push(`User is in elevated risk tier (${riskTier}).`);
  }

  if (payload.remainingDeficitUsd > 0) {
    reasons.push(
      `Deposit did not fully cure overdue deficit. Remaining overdue amount: $${payload.remainingDeficitUsd.toFixed(2)}.`
    );
  }

  if (reasons.length === 0) {
    return {
      required: false,
      ticketId: undefined,
      reasons,
      riskTier,
      activeFraudFlags,
    };
  }

  const reasonCode =
    payload.depositedUsd >= LARGE_DEPOSIT_THRESHOLD_USD
      ? 'LARGE_DEPOSIT_REVIEW'
      : normalizedDepositCount >= RAPID_DEPOSIT_COUNT_THRESHOLD
      ? 'RAPID_DEPOSIT_REVIEW'
      : riskTier !== null && riskTier >= 2
      ? 'RISK_TIER_REVIEW'
      : 'MANUAL_REVIEW_REQUIRED';

  const category = activeFraudFlags > 0 || (riskTier !== null && riskTier >= 3) ? 'risk_alert' : 'manual_review';
  const subject = `Manual review required: deposit event ${payload.stripeEventId}`;
  const message = [
    `User ${payload.userId} triggered automated risk/manual-review checks during deposit confirmation.`,
    `Deposit: $${payload.depositedUsd.toFixed(2)}`,
    `Overdue deficit before: $${payload.deficitBeforeUsd.toFixed(2)}`,
    `Remaining overdue deficit: $${payload.remainingDeficitUsd.toFixed(2)}`,
    `Auto-repaid overdue loans: ${payload.autoRepaidLoanCount}`,
    `Reactivated: ${payload.reactivated ? 'yes' : 'no'}`,
    '',
    'Reasons:',
    ...reasons.map((reason, index) => `${index + 1}. ${reason}`),
  ].join('\n');

  let ticketId: string | undefined;

  try {
    await supabase.from('fraud_flags').insert({
      user_id: payload.userId,
      reason_code: reasonCode,
      is_active: true,
      evidence_ref: payload.stripeEventId,
    });
  } catch (error: any) {
    logger.warn(
      { error: error.message, userId: payload.userId, reasonCode },
      'Unable to write fraud flag for manual review'
    );
  }

  try {
    const notification = await AdminNotificationService.notify({
      category,
      subject,
      message,
      userId: payload.userId,
      userEmail: payload.userEmail,
      metadata: {
        stripe_event_id: payload.stripeEventId,
        deposited_usd: payload.depositedUsd,
        trust_score: trustScore,
        risk_tier: riskTier,
        active_fraud_flags: activeFraudFlags,
        reasons,
        auto_repaid_loan_count: payload.autoRepaidLoanCount,
        reactivated: payload.reactivated,
      },
    });
    ticketId = notification.ticketId;
  } catch (error: any) {
    logger.error(
      { error: error.message, userId: payload.userId, category },
      'Failed to send manual review admin notification'
    );
  }

  return {
    required: true,
    ticketId,
    reasons,
    riskTier,
    activeFraudFlags,
  };
};

export const AccountRecoveryService = {
  async processConfirmedDeposit(payload: {
    userId: string;
    depositedUsd: number;
    stripeEventId: string;
    stripeSessionId: string;
    userEmail?: string;
  }): Promise<DepositRecoveryResult> {
    const depositedUsd = parseUsd(payload.depositedUsd);

    if (!payload.userId || !depositedUsd || !payload.stripeEventId) {
      throw new Error('Invalid confirmed deposit payload.');
    }

    if (await isAlreadyProcessed(payload.stripeEventId)) {
      const profile = await UserDataService.getProfile(payload.userId);
      return {
        alreadyProcessed: true,
        userId: payload.userId,
        depositedUsd,
        balanceUsd: roundUsd(Number(profile.balance || 0)),
        deficitBeforeUsd: 0,
        remainingDeficitUsd: 0,
        autoRepaidLoanCount: 0,
        autoRepaidTotalUsd: 0,
        reactivated: false,
        manualReview: {
          required: false,
          reasons: [],
          riskTier: null,
          activeFraudFlags: 0,
        },
      };
    }

    const profileBefore = await UserDataService.getProfile(payload.userId);
    const wasDefaultRestricted = getDefaultRestrictionState(profileBefore);
    const overdueBefore = await listOverdueLoans(payload.userId);
    const deficitBeforeUsd = roundUsd(
      overdueBefore.reduce((sum, loan) => sum + calculateDueAmountUsd(loan), 0)
    );

    let nextBalanceUsd = roundUsd(Number(profileBefore.balance || 0) + depositedUsd);
    const repaidLoans: Array<{ loanId: string; paidUsd: number }> = [];

    for (const loan of overdueBefore) {
      const dueAmountUsd = calculateDueAmountUsd(loan);
      if (dueAmountUsd <= 0) continue;
      if (nextBalanceUsd + 0.0001 < dueAmountUsd) {
        break;
      }

      const txHash = `auto_deposit_${payload.stripeEventId.slice(0, 12)}_${randomUUID()}`;

      const { error: repaymentError } = await supabase.from('repayment_history').insert({
        loan_id: loan.id,
        amount: dueAmountUsd,
        tx_hash: txHash,
        is_late: true,
      });

      if (repaymentError) {
        logger.error(
          { error: repaymentError.message, userId: payload.userId, loanId: loan.id },
          'Failed to auto-repay overdue loan from deposit'
        );
        break;
      }

      const { error: loanUpdateError } = await supabase
        .from('loan_activity')
        .update({ status: 'repaid' })
        .eq('id', loan.id);

      if (loanUpdateError) {
        logger.error(
          { error: loanUpdateError.message, userId: payload.userId, loanId: loan.id },
          'Failed updating loan status to repaid during deposit recovery'
        );
        break;
      }

      nextBalanceUsd = roundUsd(nextBalanceUsd - dueAmountUsd);
      repaidLoans.push({ loanId: loan.id, paidUsd: dueAmountUsd });

      await FinancePersistenceService.insertLedgerTransaction({
        userId: payload.userId,
        type: 'loan_repayment',
        amountUsd: dueAmountUsd,
        feeUsd: 0,
        netAmountUsd: dueAmountUsd,
        status: 'completed',
        provider: 'AUTO_DEPOSIT_CLEARING',
        referenceId: loan.id,
        externalEventId: payload.stripeEventId,
        metadata: {
          source: 'stripe_deposit_auto_recovery',
          stripe_session_id: payload.stripeSessionId,
          tx_hash: txHash,
          due_date: loan.due_date,
        },
      });

      await supabase.from('audit_log').insert({
        actor_id: payload.userId,
        action: AUTO_REPAY_AUDIT_ACTION,
        resource_type: 'loan_activity',
        resource_id: loan.id,
        metadata: {
          amount_usd: dueAmountUsd,
          stripe_event_id: payload.stripeEventId,
          stripe_session_id: payload.stripeSessionId,
          tx_hash: txHash,
          due_date: loan.due_date,
        },
      });
    }

    const overdueAfter = await listOverdueLoans(payload.userId);
    const remainingDeficitUsd = roundUsd(
      overdueAfter.reduce((sum, loan) => sum + calculateDueAmountUsd(loan), 0)
    );
    const shouldReactivate = wasDefaultRestricted && remainingDeficitUsd <= 0;

    const profileAfter = await UserDataService.updateProfile(payload.userId, (current) => ({
      ...current,
      balance: nextBalanceUsd,
      ...(shouldReactivate
        ? {
            defaultFlag: false,
            accountStatus: 'ACTIVE',
          }
        : {}),
    }));

    const depositLedgerId = await FinancePersistenceService.insertLedgerTransaction({
      userId: payload.userId,
      type: 'deposit',
      amountUsd: depositedUsd,
      feeUsd: 0,
      netAmountUsd: depositedUsd,
      status: 'completed',
      provider: 'STRIPE',
      referenceId: payload.stripeSessionId,
      externalEventId: payload.stripeEventId,
      metadata: {
        flow: 'deposit',
        auto_repaid_loan_count: repaidLoans.length,
      },
    });

    await supabase.from('audit_log').insert({
      actor_id: payload.userId,
      action: DEPOSIT_AUDIT_ACTION,
      resource_type: 'stripe_event',
      metadata: {
        stripe_event_id: payload.stripeEventId,
        stripe_session_id: payload.stripeSessionId,
        amount_usd: depositedUsd,
        auto_repaid_loan_count: repaidLoans.length,
        auto_repaid_total_usd: repaidLoans.reduce((sum, item) => sum + item.paidUsd, 0),
        reactivated: shouldReactivate,
        resulting_balance_usd: roundUsd(Number(profileAfter.balance || 0)),
        ledger_transaction_id: depositLedgerId,
      },
    });

    let manualReview: DepositRecoveryResult['manualReview'] = {
      required: false,
      reasons: [],
      riskTier: null,
      activeFraudFlags: 0,
    };

    try {
      manualReview = await assessRiskAndFraud({
        userId: payload.userId,
        userEmail: payload.userEmail || profileAfter.email,
        depositedUsd,
        deficitBeforeUsd,
        remainingDeficitUsd,
        stripeEventId: payload.stripeEventId,
        autoRepaidLoanCount: repaidLoans.length,
        reactivated: shouldReactivate,
      });
    } catch (error: any) {
      logger.error(
        { error: error.message, userId: payload.userId, stripeEventId: payload.stripeEventId },
        'Risk/manual review evaluation failed after confirmed deposit'
      );
    }

    return {
      alreadyProcessed: false,
      userId: payload.userId,
      depositedUsd,
      balanceUsd: roundUsd(Number(profileAfter.balance || 0)),
      deficitBeforeUsd,
      remainingDeficitUsd,
      autoRepaidLoanCount: repaidLoans.length,
      autoRepaidTotalUsd: roundUsd(repaidLoans.reduce((sum, item) => sum + item.paidUsd, 0)),
      reactivated: shouldReactivate,
      manualReview,
    };
  },
};
