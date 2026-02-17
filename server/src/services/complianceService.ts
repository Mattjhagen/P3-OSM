import { createHmac } from 'crypto';
import { supabase } from '../config/supabase';
import { config } from '../config/config';
import logger from '../utils/logger';
import { AdminNotificationService } from './adminNotificationService';

export type ComplianceFeatureKey = 'ADD_FUNDS' | 'TRADE_CRYPTO' | 'WITHDRAW_FUNDS';
export type FeatureAccessStatus =
  | 'approved'
  | 'manual_review'
  | 'denied'
  | 'revoked'
  | 'pending'
  | 'not_applied';
export type StatementType = 'MONTHLY' | 'YEARLY_TAX';

export interface FeatureAccessPolicy {
  featureKey: ComplianceFeatureKey;
  tosVersion: string;
  title: string;
  summary: string;
  disclosureKey: string;
  disclosureText: string;
}

export interface FeatureAccessStatusResult {
  userId: string;
  featureKey: ComplianceFeatureKey;
  tosVersion: string;
  status: FeatureAccessStatus;
  approved: boolean;
  requiresReacceptance: boolean;
  acceptedAt: string | null;
  lastRiskEvaluatedAt: string | null;
  riskTier: number | null;
  riskScore: number | null;
  riskReasons: string[];
  manualReviewTicketId: string | null;
  title: string;
  summary: string;
}

export interface FeatureApplicationResult extends FeatureAccessStatusResult {
  decision: 'approved' | 'manual_review' | 'denied';
}

export interface SignedDisclosureSummary {
  id: string;
  userId: string;
  featureKey: ComplianceFeatureKey;
  disclosureKey: string;
  tosVersion: string;
  accepted: boolean;
  acceptedAt: string;
  decision: 'approved' | 'manual_review' | 'denied';
  riskTier: number | null;
  riskReasons: string[];
  manualReviewTicketId: string | null;
  signatureHash: string;
  signatureAlgorithm: string;
  createdAt: string;
}

export interface SignedDisclosureDownload extends SignedDisclosureSummary {
  disclosureText: string;
  signaturePayload: Record<string, unknown>;
}

export interface StatementSummary {
  id: string;
  userId: string;
  statementType: StatementType;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  openingBalanceUsd: number;
  closingBalanceUsd: number;
  currency: string;
  signatureHash: string;
  signatureAlgorithm: string;
}

export interface StatementDownload extends StatementSummary {
  totals: Record<string, unknown>;
  entries: Array<Record<string, unknown>>;
  source: string;
  metadata: Record<string, unknown>;
}

interface FeatureRiskEvaluation {
  decision: 'approved' | 'manual_review';
  riskTier: number | null;
  riskScore: number | null;
  riskReasons: string[];
  category: 'manual_review' | 'risk_alert';
  manualReviewTicketId: string | null;
}

interface LedgerRow {
  id: string;
  type: string;
  amount_usd: number | string | null;
  fee_usd: number | string | null;
  net_amount_usd: number | string | null;
  currency: string | null;
  status: string;
  provider: string | null;
  reference_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const FEATURE_POLICIES: Record<ComplianceFeatureKey, FeatureAccessPolicy> = {
  ADD_FUNDS: {
    featureKey: 'ADD_FUNDS',
    tosVersion: 'add-funds-v1-2026-02-17',
    title: 'Add Funds Terms & Risk Application',
    summary:
      'Card and bank funding is for lawful use only. Transactions may be delayed, denied, or sent to manual review based on fraud and risk controls.',
    disclosureKey: 'funding_terms',
    disclosureText:
      'I certify all funding sources are mine or authorized. I agree to AML/KYC checks, fraud screening, and manual review escalation when red flags are detected. I understand deposits are final after settlement except where required by law.',
  },
  TRADE_CRYPTO: {
    featureKey: 'TRADE_CRYPTO',
    tosVersion: 'trade-crypto-v1-2026-02-17',
    title: 'Crypto Trading Terms & Risk Application',
    summary:
      'Crypto trading is volatile and may result in loss. Orders can be blocked or escalated for compliance review. Sell-side fees are disclosed before execution.',
    disclosureKey: 'crypto_trading_terms',
    disclosureText:
      'I acknowledge crypto price volatility and execution risk. I agree that buy/sell access depends on risk checks and fraud controls. I accept fee disclosures and attest that all activity is legal in my jurisdiction.',
  },
  WITHDRAW_FUNDS: {
    featureKey: 'WITHDRAW_FUNDS',
    tosVersion: 'withdraw-funds-v1-2026-02-17',
    title: 'Withdrawal Terms & Risk Application',
    summary:
      'Withdrawals require additional controls. Requests may be delayed or blocked pending fraud, sanctions, and account-risk review.',
    disclosureKey: 'withdrawal_terms',
    disclosureText:
      'I confirm withdrawal destinations are controlled by me or an authorized recipient. I accept withdrawal fees and compliance checks. I understand withdrawals can be delayed or escalated for manual review.',
  },
};

const STATEMENT_SCHEDULER_INTERVAL_MS = 15 * 60 * 1000;
let statementSchedulerTimer: NodeJS.Timeout | null = null;
let statementRunInProgress = false;

const roundUsd = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const toNumber = (value: unknown): number => {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
};

const createError = (status: number, message: string, code: string) => {
  const error = new Error(message) as Error & { status?: number; code?: string };
  error.status = status;
  error.code = code;
  return error;
};

const normalizeFeatureKey = (value: unknown): ComplianceFeatureKey | null => {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();

  if (normalized === 'ADD_FUNDS' || normalized === 'DEPOSIT_FUNDS') return 'ADD_FUNDS';
  if (
    normalized === 'TRADE_CRYPTO' ||
    normalized === 'BUY_SELL' ||
    normalized === 'BUY_SELL_CRYPTO'
  ) {
    return 'TRADE_CRYPTO';
  }
  if (normalized === 'WITHDRAW_FUNDS' || normalized === 'WITHDRAWALS') return 'WITHDRAW_FUNDS';

  return null;
};

const isMissingTableError = (message: string, tableName: string) => {
  const normalized = String(message || '').toLowerCase();
  return (
    normalized.includes(`could not find the table 'public.${tableName}'`) ||
    normalized.includes(`relation \"${tableName}\" does not exist`) ||
    (normalized.includes(tableName.toLowerCase()) && normalized.includes('schema cache'))
  );
};

const isMissingColumnError = (message: string, columnName: string) => {
  const normalized = String(message || '').toLowerCase();
  return (
    normalized.includes('column') &&
    normalized.includes(columnName.toLowerCase()) &&
    normalized.includes('does not exist')
  );
};

const getSigningSecret = () => {
  const fromEnv = String(config.compliance.statementSigningSecret || '').trim();
  if (fromEnv) return fromEnv;
  if (config.stripe.webhookSecret) return config.stripe.webhookSecret;
  return config.supabase.serviceKey;
};

const createSignatureHash = (payload: Record<string, unknown>) => {
  return createHmac('sha256', getSigningSecret())
    .update(JSON.stringify(payload))
    .digest('hex');
};

const getPolicy = (featureKey: ComplianceFeatureKey) => FEATURE_POLICIES[featureKey];

const mapRowToStatus = (
  userId: string,
  featureKey: ComplianceFeatureKey,
  row: any
): FeatureAccessStatusResult => {
  const policy = getPolicy(featureKey);
  const normalizedStatus = String(row?.status || 'not_applied').toLowerCase();
  const status: FeatureAccessStatus =
    normalizedStatus === 'approved' ||
    normalizedStatus === 'manual_review' ||
    normalizedStatus === 'denied' ||
    normalizedStatus === 'revoked' ||
    normalizedStatus === 'pending'
      ? (normalizedStatus as FeatureAccessStatus)
      : 'not_applied';

  const tosVersion = String(row?.tos_version || policy.tosVersion);
  const requiresReacceptance = status !== 'approved' || tosVersion !== policy.tosVersion;

  return {
    userId,
    featureKey,
    tosVersion,
    status,
    approved: status === 'approved' && !requiresReacceptance,
    requiresReacceptance,
    acceptedAt: row?.accepted_at || null,
    lastRiskEvaluatedAt: row?.last_risk_evaluated_at || null,
    riskTier: Number.isFinite(Number(row?.risk_tier)) ? Number(row.risk_tier) : null,
    riskScore: Number.isFinite(Number(row?.risk_score)) ? Number(row.risk_score) : null,
    riskReasons: Array.isArray(row?.risk_reasons)
      ? row.risk_reasons.map((item: unknown) => String(item || '').trim()).filter(Boolean)
      : [],
    manualReviewTicketId:
      typeof row?.manual_review_ticket_id === 'string' && row.manual_review_ticket_id
        ? row.manual_review_ticket_id
        : null,
    title: policy.title,
    summary: policy.summary,
  };
};

const getUserRestrictionState = async (userId: string) => {
  let row: any = null;

  {
    const { data, error } = await supabase
      .from('users')
      .select('id, status, default_flag, data')
      .eq('id', userId)
      .maybeSingle();

    if (!error) {
      row = data;
    } else if (
      isMissingColumnError(error.message, 'status') ||
      isMissingColumnError(error.message, 'default_flag')
    ) {
      const fallback = await supabase
        .from('users')
        .select('id, data')
        .eq('id', userId)
        .maybeSingle();

      if (fallback.error) {
        throw new Error(`Failed to load user profile for compliance checks: ${fallback.error.message}`);
      }
      row = fallback.data;
    } else {
      throw new Error(`Failed to load user profile for compliance checks: ${error.message}`);
    }
  }

  const data = row?.data && typeof row.data === 'object' ? row.data : {};
  const status = String(row?.status || (data as any).accountStatus || 'ACTIVE').toUpperCase();
  const defaultFlag = Boolean(row?.default_flag ?? (data as any).defaultFlag ?? false);

  return {
    status,
    defaultFlag,
  };
};

const evaluateFeatureRisk = async (
  userId: string,
  featureKey: ComplianceFeatureKey,
  existingTicketId?: string | null
): Promise<FeatureRiskEvaluation> => {
  let riskTier: number | null = null;
  let riskScore: number | null = null;
  let activeFraudFlags = 0;
  const riskReasons: string[] = [];

  const { data: snapshot, error: snapshotError } = await supabase
    .from('trust_score_snapshots')
    .select('score, risk_tier, snapshot_time')
    .eq('user_id', userId)
    .order('snapshot_time', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (snapshotError) {
    logger.warn(
      { userId, featureKey, error: snapshotError.message },
      'Feature risk evaluation could not read trust snapshot'
    );
  } else if (snapshot) {
    riskTier = Number.isFinite(Number(snapshot.risk_tier)) ? Number(snapshot.risk_tier) : null;
    riskScore = Number.isFinite(Number(snapshot.score)) ? Number(snapshot.score) : null;
  }

  const { count: fraudCount, error: fraudError } = await supabase
    .from('fraud_flags')
    .select('id', { head: true, count: 'exact' })
    .eq('user_id', userId)
    .eq('is_active', true);

  if (fraudError) {
    logger.warn(
      { userId, featureKey, error: fraudError.message },
      'Feature risk evaluation could not read fraud flags'
    );
  } else {
    activeFraudFlags = fraudCount || 0;
  }

  const accountState = await getUserRestrictionState(userId);
  if (accountState.defaultFlag || accountState.status === 'DEFAULTED' || accountState.status === 'SUSPENDED') {
    riskReasons.push('Account is currently restricted due to default or suspension status.');
  }

  if (activeFraudFlags > 0) {
    riskReasons.push(`Account has ${activeFraudFlags} active fraud flag(s).`);
  }

  if (riskTier !== null && riskTier >= 2) {
    riskReasons.push(`Risk tier ${riskTier} requires manual compliance review.`);
  }

  if (riskScore !== null && riskScore <= 30) {
    riskReasons.push(`Trust score ${riskScore} is below auto-approval threshold.`);
  }

  const decision: 'approved' | 'manual_review' = riskReasons.length > 0 ? 'manual_review' : 'approved';

  let manualReviewTicketId: string | null = existingTicketId || null;
  if (decision === 'manual_review' && !manualReviewTicketId) {
    const category: 'manual_review' | 'risk_alert' =
      activeFraudFlags > 0 || (riskTier !== null && riskTier >= 3) ? 'risk_alert' : 'manual_review';

    const subject = `Feature access manual review: ${featureKey}`;
    const message = [
      `User ${userId} requested access for feature '${featureKey}'.`,
      'Automated risk screening flagged this request for manual review.',
      '',
      ...riskReasons.map((reason, index) => `${index + 1}. ${reason}`),
      '',
      `Risk tier: ${riskTier ?? 'n/a'}`,
      `Risk score: ${riskScore ?? 'n/a'}`,
      `Active fraud flags: ${activeFraudFlags}`,
    ].join('\n');

    try {
      const notification = await AdminNotificationService.notify({
        category,
        subject,
        message,
        userId,
        metadata: {
          feature_key: featureKey,
          risk_tier: riskTier,
          risk_score: riskScore,
          active_fraud_flags: activeFraudFlags,
          reasons: riskReasons,
        },
      });
      manualReviewTicketId = notification.ticketId;
    } catch (error: any) {
      logger.error(
        { userId, featureKey, error: error.message },
        'Failed to create manual review ticket for feature application'
      );
    }
  }

  return {
    decision,
    riskTier,
    riskScore,
    riskReasons,
    category: activeFraudFlags > 0 || (riskTier !== null && riskTier >= 3) ? 'risk_alert' : 'manual_review',
    manualReviewTicketId,
  };
};

const resolveSignedLedgerAmount = (row: LedgerRow) => {
  const type = String(row.type || '').toLowerCase();
  const amountUsd = toNumber(row.amount_usd);
  const netAmountUsd = toNumber(row.net_amount_usd);
  const feeUsd = toNumber(row.fee_usd);

  switch (type) {
    case 'deposit':
    case 'sell':
    case 'loan_repayment':
      return netAmountUsd || amountUsd;
    case 'buy':
    case 'withdraw':
    case 'loan_request':
      return -Math.abs(amountUsd || netAmountUsd);
    case 'fee':
      return -Math.abs(amountUsd || netAmountUsd || feeUsd);
    default:
      if (netAmountUsd !== 0) return netAmountUsd;
      return amountUsd;
  }
};

const buildStatementPeriod = (type: StatementType, referenceTime: Date) => {
  if (type === 'MONTHLY') {
    const year = referenceTime.getUTCFullYear();
    const month = referenceTime.getUTCMonth();
    const periodStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    return {
      periodStart,
      periodEnd,
      label: `${periodStart.getUTCFullYear()}-${String(periodStart.getUTCMonth() + 1).padStart(2, '0')}`,
    };
  }

  const year = referenceTime.getUTCFullYear() - 1;
  const periodStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

  return {
    periodStart,
    periodEnd,
    label: String(year),
  };
};

const toIsoDate = (value: Date) => value.toISOString().slice(0, 10);

const fetchLedgerRows = async (
  userId: string,
  filters: {
    before?: string;
    from?: string;
    to?: string;
  }
): Promise<LedgerRow[]> => {
  let query = supabase
    .from('ledger_transactions')
    .select(
      'id, type, amount_usd, fee_usd, net_amount_usd, currency, status, provider, reference_id, metadata, created_at'
    )
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('created_at', { ascending: true })
    .limit(10000);

  if (filters.before) query = query.lt('created_at', filters.before);
  if (filters.from) query = query.gte('created_at', filters.from);
  if (filters.to) query = query.lte('created_at', filters.to);

  const { data, error } = await query;

  if (error) {
    if (isMissingTableError(error.message, 'ledger_transactions')) {
      throw createError(
        503,
        "Ledger table is missing. Apply migration 20260217043000_finance_trading_withdrawals.sql.",
        'LEDGER_TABLE_MISSING'
      );
    }
    throw new Error(`Failed to read ledger transactions for statements: ${error.message}`);
  }

  return (data || []) as LedgerRow[];
};

const generateStatementForUser = async (payload: {
  userId: string;
  statementType: StatementType;
  periodStart: Date;
  periodEnd: Date;
  source: string;
}): Promise<void> => {
  const periodStartIso = payload.periodStart.toISOString();
  const periodEndIso = payload.periodEnd.toISOString();

  const [rowsBeforeStart, rowsInPeriod] = await Promise.all([
    fetchLedgerRows(payload.userId, { before: periodStartIso }),
    fetchLedgerRows(payload.userId, { from: periodStartIso, to: periodEndIso }),
  ]);

  const openingBalanceUsd = roundUsd(
    rowsBeforeStart.reduce((sum, row) => sum + resolveSignedLedgerAmount(row), 0)
  );

  const totalsByType: Record<string, number> = {};
  let grossCreditsUsd = 0;
  let grossDebitsUsd = 0;
  let totalFeesUsd = 0;

  const entries = rowsInPeriod.map((row) => {
    const signedAmountUsd = roundUsd(resolveSignedLedgerAmount(row));
    const feeUsd = roundUsd(toNumber(row.fee_usd));

    if (signedAmountUsd >= 0) {
      grossCreditsUsd = roundUsd(grossCreditsUsd + signedAmountUsd);
    } else {
      grossDebitsUsd = roundUsd(grossDebitsUsd + Math.abs(signedAmountUsd));
    }

    totalFeesUsd = roundUsd(totalFeesUsd + feeUsd);

    const typeKey = String(row.type || 'unknown').toLowerCase();
    totalsByType[typeKey] = roundUsd((totalsByType[typeKey] || 0) + signedAmountUsd);

    return {
      id: row.id,
      createdAt: row.created_at,
      type: row.type,
      status: row.status,
      amountUsd: roundUsd(toNumber(row.amount_usd)),
      feeUsd,
      netAmountUsd: roundUsd(toNumber(row.net_amount_usd)),
      signedAmountUsd,
      currency: String(row.currency || 'USD').toUpperCase(),
      provider: row.provider || null,
      referenceId: row.reference_id || null,
      metadata: row.metadata || {},
    };
  });

  const netMovementUsd = roundUsd(entries.reduce((sum, row) => sum + Number(row.signedAmountUsd || 0), 0));
  const closingBalanceUsd = roundUsd(openingBalanceUsd + netMovementUsd);

  const taxSummary =
    payload.statementType === 'YEARLY_TAX'
      ? {
          taxableDispositionsCount: entries.filter((entry) => String(entry.type).toLowerCase() === 'sell').length,
          grossProceedsUsd: roundUsd(
            entries
              .filter((entry) => String(entry.type).toLowerCase() === 'sell')
              .reduce((sum, entry) => sum + Number(entry.netAmountUsd || 0), 0)
          ),
          deductibleFeesUsd: totalFeesUsd,
          netCashFlowUsd: netMovementUsd,
          disclaimer:
            'For informational purposes only. Consult a tax professional for filing requirements.',
        }
      : undefined;

  const totals = {
    transactionCount: entries.length,
    grossCreditsUsd,
    grossDebitsUsd,
    totalFeesUsd,
    netMovementUsd,
    byType: totalsByType,
    ...(taxSummary ? { taxSummary } : {}),
  };

  const signaturePayload = {
    userId: payload.userId,
    statementType: payload.statementType,
    periodStart: toIsoDate(payload.periodStart),
    periodEnd: toIsoDate(payload.periodEnd),
    openingBalanceUsd,
    closingBalanceUsd,
    totals,
    entries,
  };

  const signatureHash = createSignatureHash(signaturePayload);

  const row = {
    user_id: payload.userId,
    statement_type: payload.statementType,
    period_start: toIsoDate(payload.periodStart),
    period_end: toIsoDate(payload.periodEnd),
    generated_at: new Date().toISOString(),
    opening_balance_usd: openingBalanceUsd,
    closing_balance_usd: closingBalanceUsd,
    currency: 'USD',
    totals,
    entries,
    signature_algorithm: 'hmac-sha256:v1',
    signature_hash: signatureHash,
    source: payload.source,
    metadata: {
      period_label:
        payload.statementType === 'MONTHLY'
          ? `${payload.periodStart.getUTCFullYear()}-${String(
              payload.periodStart.getUTCMonth() + 1
            ).padStart(2, '0')}`
          : `${payload.periodStart.getUTCFullYear()}`,
    },
  };

  const { error } = await supabase
    .from('account_statements')
    .upsert(row, { onConflict: 'user_id,statement_type,period_start,period_end' });

  if (error) {
    if (isMissingTableError(error.message, 'account_statements')) {
      throw createError(
        503,
        "Statements table is missing. Apply migration 20260217101500_compliance_statements_and_disclosures.sql.",
        'STATEMENTS_TABLE_MISSING'
      );
    }
    throw new Error(`Failed to persist generated statement: ${error.message}`);
  }
};

const generateStatementsForAllUsers = async (payload: {
  statementType: StatementType;
  periodStart: Date;
  periodEnd: Date;
  source: string;
}) => {
  const periodStartDate = toIsoDate(payload.periodStart);
  const periodEndDate = toIsoDate(payload.periodEnd);

  const [{ data: users, error: usersError }, { data: existingRows, error: existingError }] =
    await Promise.all([
      supabase.from('users').select('id').limit(10000),
      supabase
        .from('account_statements')
        .select('user_id')
        .eq('statement_type', payload.statementType)
        .eq('period_start', periodStartDate)
        .eq('period_end', periodEndDate)
        .limit(10000),
    ]);

  if (usersError) {
    throw new Error(`Failed to list users for statement generation: ${usersError.message}`);
  }

  if (existingError) {
    if (isMissingTableError(existingError.message, 'account_statements')) {
      throw createError(
        503,
        "Statements table is missing. Apply migration 20260217101500_compliance_statements_and_disclosures.sql.",
        'STATEMENTS_TABLE_MISSING'
      );
    }
    throw new Error(`Failed to check existing statements: ${existingError.message}`);
  }

  const existingUserIds = new Set((existingRows || []).map((row: any) => String(row.user_id || '')));
  const userIds = (users || [])
    .map((row: any) => String(row.id || ''))
    .filter((id: string) => Boolean(id) && !existingUserIds.has(id));

  for (const userId of userIds) {
    await generateStatementForUser({
      userId,
      statementType: payload.statementType,
      periodStart: payload.periodStart,
      periodEnd: payload.periodEnd,
      source: payload.source,
    });
  }

  return {
    statementType: payload.statementType,
    periodStart: periodStartDate,
    periodEnd: periodEndDate,
    generatedCount: userIds.length,
  };
};

const runScheduledStatementGeneration = async (source: string) => {
  if (statementRunInProgress) return;
  statementRunInProgress = true;

  try {
    const reference = new Date();
    const monthlyPeriod = buildStatementPeriod('MONTHLY', reference);

    await generateStatementsForAllUsers({
      statementType: 'MONTHLY',
      periodStart: monthlyPeriod.periodStart,
      periodEnd: monthlyPeriod.periodEnd,
      source,
    });

    if (reference.getUTCMonth() === 0) {
      const yearlyPeriod = buildStatementPeriod('YEARLY_TAX', reference);
      await generateStatementsForAllUsers({
        statementType: 'YEARLY_TAX',
        periodStart: yearlyPeriod.periodStart,
        periodEnd: yearlyPeriod.periodEnd,
        source,
      });
    }
  } finally {
    statementRunInProgress = false;
  }
};

export const ComplianceService = {
  getFeaturePolicies() {
    return Object.values(FEATURE_POLICIES);
  },

  normalizeFeatureKey,

  async getFeatureStatus(userId: string, rawFeatureKey: unknown): Promise<FeatureAccessStatusResult> {
    const featureKey = normalizeFeatureKey(rawFeatureKey);
    if (!userId || !userId.trim()) {
      throw createError(400, 'userId is required.', 'MISSING_USER_ID');
    }
    if (!featureKey) {
      throw createError(400, 'Unsupported feature key.', 'INVALID_FEATURE_KEY');
    }

    const policy = getPolicy(featureKey);

    const { data, error } = await supabase
      .from('feature_access_controls')
      .select(
        'user_id, feature_key, tos_version, status, accepted_at, last_risk_evaluated_at, risk_tier, risk_score, risk_reasons, manual_review_ticket_id'
      )
      .eq('user_id', userId)
      .eq('feature_key', featureKey)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error.message, 'feature_access_controls')) {
        throw createError(
          503,
          "Feature compliance tables are missing. Apply migration 20260217101500_compliance_statements_and_disclosures.sql.",
          'FEATURE_ACCESS_TABLE_MISSING'
        );
      }
      throw new Error(`Failed to load feature access status: ${error.message}`);
    }

    if (!data) {
      return {
        userId,
        featureKey,
        tosVersion: policy.tosVersion,
        status: 'not_applied',
        approved: false,
        requiresReacceptance: true,
        acceptedAt: null,
        lastRiskEvaluatedAt: null,
        riskTier: null,
        riskScore: null,
        riskReasons: [],
        manualReviewTicketId: null,
        title: policy.title,
        summary: policy.summary,
      };
    }

    return mapRowToStatus(userId, featureKey, data);
  },

  async applyForFeature(payload: {
    userId: string;
    featureKey: unknown;
    accepted: boolean;
    userEmail?: string;
    attestationSignature?: string;
    walletAddress?: string;
    source?: string;
    userAgent?: string;
    ipAddress?: string;
  }): Promise<FeatureApplicationResult> {
    const userId = String(payload.userId || '').trim();
    const featureKey = normalizeFeatureKey(payload.featureKey);

    if (!userId) {
      throw createError(400, 'userId is required.', 'MISSING_USER_ID');
    }
    if (!featureKey) {
      throw createError(400, 'Unsupported feature key.', 'INVALID_FEATURE_KEY');
    }

    const policy = getPolicy(featureKey);
    const nowIso = new Date().toISOString();

    const currentStatus = await this.getFeatureStatus(userId, featureKey);

    if (currentStatus.approved && !currentStatus.requiresReacceptance) {
      return {
        ...currentStatus,
        decision: 'approved',
      };
    }

    const accepted = Boolean(payload.accepted);
    let decision: 'approved' | 'manual_review' | 'denied' = 'denied';
    let riskTier: number | null = null;
    let riskScore: number | null = null;
    let riskReasons: string[] = [];
    let manualReviewTicketId: string | null = currentStatus.manualReviewTicketId || null;

    if (!accepted) {
      riskReasons = ['Feature terms were not accepted by the user.'];
      decision = 'denied';
    } else {
      const risk = await evaluateFeatureRisk(userId, featureKey, manualReviewTicketId);
      decision = risk.decision;
      riskTier = risk.riskTier;
      riskScore = risk.riskScore;
      riskReasons = risk.riskReasons;
      manualReviewTicketId = risk.manualReviewTicketId;
    }

    const statusValue = decision === 'approved' ? 'approved' : decision === 'manual_review' ? 'manual_review' : 'denied';

    const controlRow = {
      user_id: userId,
      feature_key: featureKey,
      tos_version: policy.tosVersion,
      status: statusValue,
      accepted_at: accepted ? nowIso : null,
      last_risk_evaluated_at: nowIso,
      risk_tier: riskTier,
      risk_score: riskScore,
      risk_reasons: riskReasons,
      manual_review_ticket_id: manualReviewTicketId,
      metadata: {
        source: payload.source || 'frontend',
        user_agent: payload.userAgent || null,
        ip_address: payload.ipAddress || null,
        wallet_address: payload.walletAddress || null,
      },
    };

    const { error: controlError } = await supabase
      .from('feature_access_controls')
      .upsert(controlRow, { onConflict: 'user_id,feature_key' });

    if (controlError) {
      if (isMissingTableError(controlError.message, 'feature_access_controls')) {
        throw createError(
          503,
          "Feature compliance tables are missing. Apply migration 20260217101500_compliance_statements_and_disclosures.sql.",
          'FEATURE_ACCESS_TABLE_MISSING'
        );
      }
      throw new Error(`Failed to persist feature access application: ${controlError.message}`);
    }

    const signaturePayload = {
      userId,
      featureKey,
      tosVersion: policy.tosVersion,
      accepted,
      decision,
      acceptedAt: accepted ? nowIso : null,
      riskTier,
      riskScore,
      riskReasons,
      attestationSignature: payload.attestationSignature || null,
      walletAddress: payload.walletAddress || null,
      source: payload.source || 'frontend',
      userAgent: payload.userAgent || null,
      ipAddress: payload.ipAddress || null,
    };

    const signatureHash = createSignatureHash(signaturePayload);

    const { error: disclosureError } = await supabase.from('signed_disclosures').insert({
      user_id: userId,
      feature_key: featureKey,
      disclosure_key: policy.disclosureKey,
      tos_version: policy.tosVersion,
      disclosure_text: policy.disclosureText,
      accepted,
      accepted_at: accepted ? nowIso : nowIso,
      decision,
      risk_tier: riskTier,
      risk_reasons: riskReasons,
      manual_review_ticket_id: manualReviewTicketId,
      signature_algorithm: 'hmac-sha256:v1',
      signature_hash: signatureHash,
      signature_payload: signaturePayload,
    });

    if (disclosureError) {
      if (isMissingTableError(disclosureError.message, 'signed_disclosures')) {
        throw createError(
          503,
          "Signed disclosures table is missing. Apply migration 20260217101500_compliance_statements_and_disclosures.sql.",
          'DISCLOSURE_TABLE_MISSING'
        );
      }
      throw new Error(`Failed to persist signed disclosure: ${disclosureError.message}`);
    }

    const result = mapRowToStatus(userId, featureKey, {
      ...controlRow,
      risk_reasons: riskReasons,
      manual_review_ticket_id: manualReviewTicketId,
    });

    return {
      ...result,
      decision,
    };
  },

  async requireFeatureApproval(userId: string, rawFeatureKey: unknown) {
    const status = await this.getFeatureStatus(userId, rawFeatureKey);

    if (status.approved && !status.requiresReacceptance) {
      return status;
    }

    if (status.status === 'manual_review') {
      throw createError(
        403,
        'Your application for this feature is pending manual review by P3 compliance staff.',
        'FEATURE_ACCESS_MANUAL_REVIEW'
      );
    }

    if (status.status === 'denied') {
      throw createError(
        403,
        'Feature access is denied until Terms are accepted and risk checks pass.',
        'FEATURE_ACCESS_DENIED'
      );
    }

    throw createError(
      403,
      'Feature terms must be accepted before this action can be used.',
      'FEATURE_ACCESS_NOT_APPROVED'
    );
  },

  async listSignedDisclosures(payload: {
    userId: string;
    featureKey?: unknown;
    limit?: number;
  }): Promise<SignedDisclosureSummary[]> {
    const userId = String(payload.userId || '').trim();
    if (!userId) {
      throw createError(400, 'userId is required.', 'MISSING_USER_ID');
    }

    const limit = Number.isFinite(Number(payload.limit))
      ? Math.max(1, Math.min(200, Number(payload.limit)))
      : 100;

    const normalizedFeatureKey = payload.featureKey
      ? normalizeFeatureKey(payload.featureKey)
      : null;

    let query = supabase
      .from('signed_disclosures')
      .select(
        'id, user_id, feature_key, disclosure_key, tos_version, accepted, accepted_at, decision, risk_tier, risk_reasons, manual_review_ticket_id, signature_hash, signature_algorithm, created_at'
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (normalizedFeatureKey) {
      query = query.eq('feature_key', normalizedFeatureKey);
    }

    const { data, error } = await query;

    if (error) {
      if (isMissingTableError(error.message, 'signed_disclosures')) {
        throw createError(
          503,
          "Signed disclosures table is missing. Apply migration 20260217101500_compliance_statements_and_disclosures.sql.",
          'DISCLOSURE_TABLE_MISSING'
        );
      }
      throw new Error(`Failed to load signed disclosures: ${error.message}`);
    }

    return (data || []).map((row: any) => ({
      id: String(row.id),
      userId: String(row.user_id),
      featureKey: normalizeFeatureKey(row.feature_key) || 'ADD_FUNDS',
      disclosureKey: String(row.disclosure_key),
      tosVersion: String(row.tos_version),
      accepted: Boolean(row.accepted),
      acceptedAt: String(row.accepted_at),
      decision: String(row.decision) as SignedDisclosureSummary['decision'],
      riskTier: Number.isFinite(Number(row.risk_tier)) ? Number(row.risk_tier) : null,
      riskReasons: Array.isArray(row.risk_reasons)
        ? row.risk_reasons.map((item: unknown) => String(item || '')).filter(Boolean)
        : [],
      manualReviewTicketId:
        typeof row.manual_review_ticket_id === 'string' && row.manual_review_ticket_id
          ? row.manual_review_ticket_id
          : null,
      signatureHash: String(row.signature_hash),
      signatureAlgorithm: String(row.signature_algorithm || 'hmac-sha256:v1'),
      createdAt: String(row.created_at),
    }));
  },

  async getSignedDisclosureDownload(payload: {
    disclosureId: string;
    userId: string;
  }): Promise<SignedDisclosureDownload> {
    const disclosureId = String(payload.disclosureId || '').trim();
    const userId = String(payload.userId || '').trim();

    if (!disclosureId) {
      throw createError(400, 'disclosureId is required.', 'MISSING_DISCLOSURE_ID');
    }

    if (!userId) {
      throw createError(400, 'userId is required.', 'MISSING_USER_ID');
    }

    const { data, error } = await supabase
      .from('signed_disclosures')
      .select('*')
      .eq('id', disclosureId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error.message, 'signed_disclosures')) {
        throw createError(
          503,
          "Signed disclosures table is missing. Apply migration 20260217101500_compliance_statements_and_disclosures.sql.",
          'DISCLOSURE_TABLE_MISSING'
        );
      }
      throw new Error(`Failed to load signed disclosure: ${error.message}`);
    }

    if (!data) {
      throw createError(404, 'Signed disclosure not found.', 'DISCLOSURE_NOT_FOUND');
    }

    return {
      id: String(data.id),
      userId: String(data.user_id),
      featureKey: normalizeFeatureKey(data.feature_key) || 'ADD_FUNDS',
      disclosureKey: String(data.disclosure_key),
      tosVersion: String(data.tos_version),
      disclosureText: String(data.disclosure_text || ''),
      accepted: Boolean(data.accepted),
      acceptedAt: String(data.accepted_at),
      decision: String(data.decision) as SignedDisclosureDownload['decision'],
      riskTier: Number.isFinite(Number(data.risk_tier)) ? Number(data.risk_tier) : null,
      riskReasons: Array.isArray(data.risk_reasons)
        ? data.risk_reasons.map((item: unknown) => String(item || '')).filter(Boolean)
        : [],
      manualReviewTicketId:
        typeof data.manual_review_ticket_id === 'string' && data.manual_review_ticket_id
          ? data.manual_review_ticket_id
          : null,
      signatureHash: String(data.signature_hash),
      signatureAlgorithm: String(data.signature_algorithm || 'hmac-sha256:v1'),
      signaturePayload:
        data.signature_payload && typeof data.signature_payload === 'object'
          ? data.signature_payload
          : {},
      createdAt: String(data.created_at),
    };
  },

  async listStatements(payload: {
    userId: string;
    statementType?: StatementType;
    limit?: number;
  }): Promise<StatementSummary[]> {
    const userId = String(payload.userId || '').trim();
    if (!userId) {
      throw createError(400, 'userId is required.', 'MISSING_USER_ID');
    }

    const limit = Number.isFinite(Number(payload.limit))
      ? Math.max(1, Math.min(200, Number(payload.limit)))
      : 100;

    let query = supabase
      .from('account_statements')
      .select(
        'id, user_id, statement_type, period_start, period_end, generated_at, opening_balance_usd, closing_balance_usd, currency, signature_hash, signature_algorithm'
      )
      .eq('user_id', userId)
      .order('period_start', { ascending: false })
      .order('generated_at', { ascending: false })
      .limit(limit);

    if (payload.statementType) {
      query = query.eq('statement_type', payload.statementType);
    }

    const { data, error } = await query;

    if (error) {
      if (isMissingTableError(error.message, 'account_statements')) {
        throw createError(
          503,
          "Statements table is missing. Apply migration 20260217101500_compliance_statements_and_disclosures.sql.",
          'STATEMENTS_TABLE_MISSING'
        );
      }
      throw new Error(`Failed to load statements: ${error.message}`);
    }

    return (data || []).map((row: any) => ({
      id: String(row.id),
      userId: String(row.user_id),
      statementType: String(row.statement_type) as StatementType,
      periodStart: String(row.period_start),
      periodEnd: String(row.period_end),
      generatedAt: String(row.generated_at),
      openingBalanceUsd: roundUsd(toNumber(row.opening_balance_usd)),
      closingBalanceUsd: roundUsd(toNumber(row.closing_balance_usd)),
      currency: String(row.currency || 'USD').toUpperCase(),
      signatureHash: String(row.signature_hash),
      signatureAlgorithm: String(row.signature_algorithm || 'hmac-sha256:v1'),
    }));
  },

  async getStatementDownload(payload: {
    statementId: string;
    userId: string;
  }): Promise<StatementDownload> {
    const statementId = String(payload.statementId || '').trim();
    const userId = String(payload.userId || '').trim();

    if (!statementId) {
      throw createError(400, 'statementId is required.', 'MISSING_STATEMENT_ID');
    }

    if (!userId) {
      throw createError(400, 'userId is required.', 'MISSING_USER_ID');
    }

    const { data, error } = await supabase
      .from('account_statements')
      .select('*')
      .eq('id', statementId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error.message, 'account_statements')) {
        throw createError(
          503,
          "Statements table is missing. Apply migration 20260217101500_compliance_statements_and_disclosures.sql.",
          'STATEMENTS_TABLE_MISSING'
        );
      }
      throw new Error(`Failed to load statement: ${error.message}`);
    }

    if (!data) {
      throw createError(404, 'Statement not found.', 'STATEMENT_NOT_FOUND');
    }

    return {
      id: String(data.id),
      userId: String(data.user_id),
      statementType: String(data.statement_type) as StatementType,
      periodStart: String(data.period_start),
      periodEnd: String(data.period_end),
      generatedAt: String(data.generated_at),
      openingBalanceUsd: roundUsd(toNumber(data.opening_balance_usd)),
      closingBalanceUsd: roundUsd(toNumber(data.closing_balance_usd)),
      currency: String(data.currency || 'USD').toUpperCase(),
      totals: data.totals && typeof data.totals === 'object' ? data.totals : {},
      entries: Array.isArray(data.entries) ? data.entries : [],
      signatureHash: String(data.signature_hash),
      signatureAlgorithm: String(data.signature_algorithm || 'hmac-sha256:v1'),
      source: String(data.source || 'scheduler'),
      metadata: data.metadata && typeof data.metadata === 'object' ? data.metadata : {},
    };
  },

  async generateMonthlyStatements(source = 'manual') {
    const period = buildStatementPeriod('MONTHLY', new Date());
    return generateStatementsForAllUsers({
      statementType: 'MONTHLY',
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      source,
    });
  },

  async generateYearlyTaxStatements(source = 'manual') {
    const period = buildStatementPeriod('YEARLY_TAX', new Date());
    return generateStatementsForAllUsers({
      statementType: 'YEARLY_TAX',
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      source,
    });
  },

  async runScheduledStatementGeneration() {
    await runScheduledStatementGeneration('scheduler');
  },

  startStatementScheduler() {
    if (process.env.NODE_ENV === 'test') return;
    if (statementSchedulerTimer) return;

    const tick = async () => {
      try {
        await runScheduledStatementGeneration('scheduler');
      } catch (error: any) {
        logger.error({ error: error.message }, 'Statement scheduler failed');
      }
    };

    tick();
    statementSchedulerTimer = setInterval(tick, STATEMENT_SCHEDULER_INTERVAL_MS);

    logger.info(
      {
        intervalMinutes: STATEMENT_SCHEDULER_INTERVAL_MS / 60000,
      },
      'Compliance statement scheduler started'
    );
  },

  stopStatementScheduler() {
    if (!statementSchedulerTimer) return;
    clearInterval(statementSchedulerTimer);
    statementSchedulerTimer = null;
  },
};
