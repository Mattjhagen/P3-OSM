import Stripe from 'stripe';
import { config } from '../config/config';
import { FeePolicyService } from './feePolicyService';
import { FinancePersistenceService } from './financePersistenceService';
import { MarketPriceService } from './marketPriceService';
import { recordTransferNotificationBestEffort } from './notificationEventService';
import { TransactionGuardService } from './transactionGuardService';
import { UserDataService } from './userDataService';

type WithdrawalMethod = 'STRIPE' | 'BTC';

export interface WithdrawalRequestPayload {
  userId: string;
  method: WithdrawalMethod;
  amountUsd: number;
  destination: string;
}

export interface WithdrawalResult {
  requestId: string | null;
  ledgerId: string | null;
  method: WithdrawalMethod;
  grossAmountUsd: number;
  feeUsd: number;
  payoutAmountUsd: number;
  provider: string;
  providerReference: string | null;
  balanceUsd: number;
  destination: string;
  estimatedBtc?: number;
}

let stripeClient: Stripe | null = null;

const roundUsd = (value: number) => Math.round(value * 100) / 100;
const roundQty = (value: number) => Math.round(value * 1e8) / 1e8;

const getStripeClient = () => {
  if (!config.stripe.secretKey) {
    return null;
  }

  if (!stripeClient) {
    stripeClient = new Stripe(config.stripe.secretKey, {
      apiVersion: '2023-10-16' as any,
    });
  }

  return stripeClient;
};

const maskDestination = (value: string) => {
  if (!value) return 'unknown';
  if (value.length < 8) return '****';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

const isValidBtcAddress = (value: string) => {
  const normalized = value.trim();
  if (!normalized) return false;
  // Legacy/Base58 + Bech32 basic validation
  if (/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{20,}$/.test(normalized)) return true;
  return false;
};

const executeStripeWithdrawal = async (
  userId: string,
  payoutAmountUsd: number,
  destination: string
): Promise<{ provider: string; providerReference: string }> => {
  if (!config.stripe.payoutsEnabled) {
    throw new Error('Stripe payouts are disabled. Enable STRIPE_PAYOUTS_ENABLED to process Stripe withdrawals.');
  }

  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY for Stripe withdrawals.');
  }

  if (!destination || !destination.trim()) {
    throw new Error('A Stripe connected account id is required for Stripe withdrawals.');
  }

  const amountCents = Math.round(payoutAmountUsd * 100);
  if (amountCents <= 0) {
    throw new Error('Withdrawal amount is too small after fees.');
  }

  const transfer = await stripe.transfers.create({
    amount: amountCents,
    currency: 'usd',
    destination: destination.trim(),
    metadata: {
      flow: 'withdrawal',
      userId,
      payoutAmountUsd: payoutAmountUsd.toFixed(2),
    },
  });

  return {
    provider: 'STRIPE_CONNECT',
    providerReference: transfer.id,
  };
};

const executeBtcWithdrawal = async (
  userId: string,
  payoutAmountUsd: number,
  destination: string
): Promise<{ provider: string; providerReference: string; estimatedBtc: number }> => {
  if (!config.withdrawals.btcEnabled) {
    throw new Error('BTC withdrawals are disabled. Enable BTC_WITHDRAWALS_ENABLED to continue.');
  }

  if (!config.withdrawals.btcProviderUrl || !config.withdrawals.btcProviderToken) {
    throw new Error(
      'BTC provider is not configured. Set BTC_WITHDRAW_PROVIDER_URL and BTC_WITHDRAW_PROVIDER_TOKEN.'
    );
  }

  if (!isValidBtcAddress(destination)) {
    throw new Error('BTC destination address is invalid.');
  }

  const btcQuote = await MarketPriceService.getSpotPrice('BTC');
  const estimatedBtc = roundQty(payoutAmountUsd / btcQuote.usd);

  const response = await fetch(config.withdrawals.btcProviderUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.withdrawals.btcProviderToken}`,
    },
    body: JSON.stringify({
      userId,
      destination,
      amountUsd: payoutAmountUsd,
      estimatedBtc,
      spotPriceUsd: btcQuote.usd,
      source: 'p3-lending-withdrawal',
    }),
  });

  let responseBody: any = null;
  try {
    responseBody = await response.json();
  } catch {
    responseBody = null;
  }

  if (!response.ok) {
    const detail = responseBody?.error || responseBody?.message || `HTTP ${response.status}`;
    throw new Error(`BTC withdrawal provider request failed: ${detail}`);
  }

  const providerReference =
    String(responseBody?.txId || responseBody?.transactionId || responseBody?.id || '').trim();

  if (!providerReference) {
    throw new Error('BTC provider did not return a transaction reference.');
  }

  return {
    provider: 'BTC_PROVIDER',
    providerReference,
    estimatedBtc,
  };
};

export const WithdrawalService = {
  async requestWithdrawal(payload: WithdrawalRequestPayload): Promise<WithdrawalResult> {
    if (!payload.userId || !payload.userId.trim()) {
      throw new Error('userId is required.');
    }

    const method = payload.method;
    const grossAmountUsd = Number(payload.amountUsd || 0);

    if (method !== 'STRIPE' && method !== 'BTC') {
      throw new Error('method must be STRIPE or BTC.');
    }

    if (!Number.isFinite(grossAmountUsd) || grossAmountUsd <= 0) {
      throw new Error('amountUsd must be a positive number.');
    }

    const fee = FeePolicyService.calculate(
      method === 'BTC' ? 'withdraw_btc' : 'withdraw_stripe',
      grossAmountUsd
    );

    if (fee.netAmountUsd <= 0) {
      throw new Error('Withdrawal amount is too small after fees.');
    }

    const profile = await UserDataService.getProfile(payload.userId);
    TransactionGuardService.validateUserStatus(profile);
    TransactionGuardService.validateBalance(profile, fee.grossAmountUsd);

    let provider = '';
    let providerReference = '';
    let estimatedBtc: number | undefined;

    if (method === 'STRIPE') {
      const stripeResult = await executeStripeWithdrawal(payload.userId, fee.netAmountUsd, payload.destination);
      provider = stripeResult.provider;
      providerReference = stripeResult.providerReference;
    } else {
      const btcResult = await executeBtcWithdrawal(payload.userId, fee.netAmountUsd, payload.destination);
      provider = btcResult.provider;
      providerReference = btcResult.providerReference;
      estimatedBtc = btcResult.estimatedBtc;
    }

    const updatedProfile = await UserDataService.updateProfile(payload.userId, (existing) => ({
      ...existing,
      balance: roundUsd(Number(existing.balance || 0) - fee.grossAmountUsd),
    }));

    const requestId = await FinancePersistenceService.createWithdrawalRequest({
      userId: payload.userId,
      method,
      amountUsd: fee.grossAmountUsd,
      feeUsd: fee.feeTotalUsd,
      netAmountUsd: fee.netAmountUsd,
      destination: payload.destination,
      status: 'succeeded',
      provider,
      providerReference,
      metadata: {
        destination_masked: maskDestination(payload.destination),
        estimated_btc: estimatedBtc,
      },
    });

    const ledgerId = await FinancePersistenceService.insertLedgerTransaction({
      userId: payload.userId,
      type: 'withdraw',
      amountUsd: fee.grossAmountUsd,
      feeUsd: fee.feeTotalUsd,
      netAmountUsd: fee.netAmountUsd,
      status: 'completed',
      provider,
      referenceId: requestId || undefined,
      externalEventId: providerReference,
      metadata: {
        method,
        destination_masked: maskDestination(payload.destination),
        estimated_btc: estimatedBtc,
      },
    });

    await FinancePersistenceService.insertFeeAccrual({
      userId: payload.userId,
      action: method === 'BTC' ? 'withdraw_btc' : 'withdraw_stripe',
      feeUsd: fee.feeTotalUsd,
      ledgerTransactionId: ledgerId,
      referenceId: requestId || undefined,
      settlementStatus: 'pending',
      metadata: {
        provider: 'stripe',
        provider_reference: providerReference,
      },
    });

    await recordTransferNotificationBestEffort({
      userId: payload.userId,
      email: updatedProfile.email,
      requestId,
      ledgerId,
      method,
      amountUsd: fee.grossAmountUsd,
      payoutAmountUsd: fee.netAmountUsd,
      feeUsd: fee.feeTotalUsd,
      destinationMasked: maskDestination(payload.destination),
      provider,
      providerReference,
      estimatedBtc,
    });

    return {
      requestId,
      ledgerId,
      method,
      grossAmountUsd: fee.grossAmountUsd,
      feeUsd: fee.feeTotalUsd,
      payoutAmountUsd: fee.netAmountUsd,
      provider,
      providerReference,
      balanceUsd: roundUsd(Number(updatedProfile.balance || 0)),
      destination: maskDestination(payload.destination),
      estimatedBtc,
    };
  },
};
