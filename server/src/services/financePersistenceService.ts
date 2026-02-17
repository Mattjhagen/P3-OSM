import { supabase } from '../config/supabase';

export type LedgerTransactionType =
  | 'deposit'
  | 'withdraw'
  | 'buy'
  | 'sell'
  | 'loan_request'
  | 'loan_repayment'
  | 'fee';

export interface LedgerInsertPayload {
  userId: string;
  type: LedgerTransactionType;
  amountUsd: number;
  feeUsd?: number;
  netAmountUsd?: number;
  currency?: string;
  status: 'pending' | 'completed' | 'failed';
  provider?: string;
  referenceId?: string;
  externalEventId?: string;
  metadata?: Record<string, unknown>;
}

const isMissingTableError = (message: string, tableName: string) => {
  const normalized = (message || '').toLowerCase();
  return (
    normalized.includes(`could not find the table 'public.${tableName}'`) ||
    normalized.includes(`relation "${tableName}" does not exist`) ||
    (normalized.includes(tableName.toLowerCase()) && normalized.includes('schema cache'))
  );
};

const roundUsd = (value: number) => Math.round(value * 100) / 100;

const insertAuditFallback = async (
  action: string,
  actorId: string,
  metadata: Record<string, unknown>
) => {
  await supabase.from('audit_log').insert({
    actor_id: actorId,
    action,
    resource_type: 'finance_event',
    metadata,
  });
};

export const FinancePersistenceService = {
  async insertLedgerTransaction(payload: LedgerInsertPayload): Promise<string | null> {
    const row = {
      user_id: payload.userId,
      type: payload.type,
      amount_usd: roundUsd(payload.amountUsd),
      fee_usd: roundUsd(payload.feeUsd || 0),
      net_amount_usd: roundUsd(
        typeof payload.netAmountUsd === 'number'
          ? payload.netAmountUsd
          : payload.amountUsd - (payload.feeUsd || 0)
      ),
      currency: (payload.currency || 'USD').toUpperCase(),
      status: payload.status,
      provider: payload.provider || null,
      reference_id: payload.referenceId || null,
      external_event_id: payload.externalEventId || null,
      metadata: payload.metadata || {},
    };

    const { data, error } = await supabase
      .from('ledger_transactions')
      .insert(row)
      .select('id')
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error.message, 'ledger_transactions')) {
        await insertAuditFallback('ledger_transaction_fallback', payload.userId, row);
        return null;
      }
      throw new Error(`Failed to persist ledger transaction: ${error.message}`);
    }

    return data?.id || null;
  },

  async insertFeeAccrual(payload: {
    userId: string;
    action: string;
    feeUsd: number;
    ledgerTransactionId?: string | null;
    referenceId?: string;
    settlementStatus?: 'pending' | 'settled' | 'failed';
    metadata?: Record<string, unknown>;
  }): Promise<string | null> {
    const row = {
      user_id: payload.userId,
      action: payload.action,
      fee_usd: roundUsd(payload.feeUsd),
      ledger_transaction_id: payload.ledgerTransactionId || null,
      reference_id: payload.referenceId || null,
      settlement_status: payload.settlementStatus || 'pending',
      settlement_target: 'stripe',
      metadata: payload.metadata || {},
    };

    const { data, error } = await supabase
      .from('platform_fee_accruals')
      .insert(row)
      .select('id')
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error.message, 'platform_fee_accruals')) {
        await insertAuditFallback('fee_accrual_fallback', payload.userId, row);
        return null;
      }
      throw new Error(`Failed to persist fee accrual: ${error.message}`);
    }

    return data?.id || null;
  },

  async createCryptoOrder(payload: {
    userId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    grossAmountUsd: number;
    feeUsd: number;
    netAmountUsd: number;
    quantity: number;
    executedPriceUsd: number;
    status: 'pending' | 'succeeded' | 'failed';
    provider: string;
    failureReason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<string | null> {
    const row = {
      user_id: payload.userId,
      symbol: payload.symbol,
      side: payload.side,
      gross_amount_usd: roundUsd(payload.grossAmountUsd),
      fee_usd: roundUsd(payload.feeUsd),
      net_amount_usd: roundUsd(payload.netAmountUsd),
      quantity: payload.quantity,
      executed_price_usd: payload.executedPriceUsd,
      status: payload.status,
      provider: payload.provider,
      failure_reason: payload.failureReason || null,
      metadata: payload.metadata || {},
    };

    const { data, error } = await supabase
      .from('crypto_orders')
      .insert(row)
      .select('id')
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error.message, 'crypto_orders')) {
        await insertAuditFallback('crypto_order_fallback', payload.userId, row);
        return null;
      }
      throw new Error(`Failed to persist crypto order: ${error.message}`);
    }

    return data?.id || null;
  },

  async createWithdrawalRequest(payload: {
    userId: string;
    method: 'STRIPE' | 'BTC' | 'BANK';
    amountUsd: number;
    feeUsd: number;
    netAmountUsd: number;
    destination: string;
    status: 'pending' | 'succeeded' | 'failed';
    provider: string;
    providerReference?: string;
    failureReason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<string | null> {
    const row = {
      user_id: payload.userId,
      method: payload.method,
      amount_usd: roundUsd(payload.amountUsd),
      fee_usd: roundUsd(payload.feeUsd),
      net_amount_usd: roundUsd(payload.netAmountUsd),
      destination: payload.destination,
      status: payload.status,
      provider: payload.provider,
      provider_reference: payload.providerReference || null,
      failure_reason: payload.failureReason || null,
      metadata: payload.metadata || {},
    };

    const { data, error } = await supabase
      .from('withdrawal_requests')
      .insert(row)
      .select('id')
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error.message, 'withdrawal_requests')) {
        await insertAuditFallback('withdrawal_request_fallback', payload.userId, row);
        return null;
      }
      throw new Error(`Failed to persist withdrawal request: ${error.message}`);
    }

    return data?.id || null;
  },

  async createPlaidBankLink(payload: {
    userId: string;
    plaidItemId: string;
    plaidAccountId: string;
    mask: string;
    institutionName: string;
    processorToken: string;
    metadata?: Record<string, unknown>;
  }): Promise<string | null> {
    const row = {
      user_id: payload.userId,
      plaid_item_id: payload.plaidItemId,
      plaid_account_id: payload.plaidAccountId,
      account_mask: payload.mask,
      institution_name: payload.institutionName,
      processor_token: payload.processorToken,
      metadata: payload.metadata || {},
      status: 'active',
    };

    const { data, error } = await supabase
      .from('plaid_bank_links')
      .upsert(row, { onConflict: 'user_id,plaid_account_id' })
      .select('id')
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error.message, 'plaid_bank_links')) {
        await insertAuditFallback('plaid_link_fallback', payload.userId, row);
        return null;
      }
      throw new Error(`Failed to persist Plaid bank link: ${error.message}`);
    }

    return data?.id || null;
  },
};
