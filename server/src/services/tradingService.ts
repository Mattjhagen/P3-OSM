import { config } from '../config/config';
import { FeePolicyService } from './feePolicyService';
import { FinancePersistenceService } from './financePersistenceService';
import { MarketPriceService } from './marketPriceService';
import { TransactionGuardService } from './transactionGuardService';
import { UserDataService } from './userDataService';

const roundUsd = (value: number) => Math.round(value * 100) / 100;
const roundQty = (value: number) => Math.round(value * 1e8) / 1e8;

export interface TradeOrderPreview {
  symbol: string;
  side: 'BUY' | 'SELL';
  grossAmountUsd: number;
  feeUsd: number;
  netAmountUsd: number;
  estimatedQuantity: number;
  priceUsd: number;
  providerEnabled: boolean;
  provider: string;
  feePolicy: {
    percent: number;
    fixedUsd: number;
  };
}

export interface ExecuteTradePayload {
  userId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  amountUsd: number;
  sellDisclosureSignature?: string;
}

export interface ExecuteTradeResult {
  orderId: string | null;
  ledgerId: string | null;
  balanceUsd: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  feeUsd: number;
  grossAmountUsd: number;
  netAmountUsd: number;
  quantity: number;
  priceUsd: number;
  provider: string;
}

const normalizeSymbol = (symbol: string) => symbol.trim().toUpperCase();

const getProviderName = () => (config.trading.providerEnabled ? 'INTERNAL_LEDGER' : 'DISABLED');

export const TradingService = {
  async previewOrder(payload: ExecuteTradePayload): Promise<TradeOrderPreview> {
    const symbol = normalizeSymbol(payload.symbol);
    const side = payload.side;
    const grossAmountUsd = Number(payload.amountUsd || 0);

    if (!payload.userId || !payload.userId.trim()) {
      throw new Error('userId is required.');
    }

    if (side !== 'BUY' && side !== 'SELL') {
      throw new Error('side must be BUY or SELL.');
    }

    if (!Number.isFinite(grossAmountUsd) || grossAmountUsd <= 0) {
      throw new Error('amountUsd must be a positive number.');
    }

    const quote = await MarketPriceService.getSpotPrice(symbol);
    const fee = FeePolicyService.calculate(side === 'BUY' ? 'buy_crypto' : 'sell_crypto', grossAmountUsd);

    if (fee.netAmountUsd <= 0) {
      throw new Error('Amount is too small after fees. Increase order size.');
    }

    const estimatedQuantity =
      side === 'BUY'
        ? roundQty(fee.netAmountUsd / quote.usd)
        : roundQty(fee.grossAmountUsd / quote.usd);

    return {
      symbol,
      side,
      grossAmountUsd: fee.grossAmountUsd,
      feeUsd: fee.feeTotalUsd,
      netAmountUsd: fee.netAmountUsd,
      estimatedQuantity,
      priceUsd: quote.usd,
      providerEnabled: config.trading.providerEnabled,
      provider: getProviderName(),
      feePolicy: {
        percent: fee.feePercent,
        fixedUsd: fee.feeFixedAmountUsd,
      },
    };
  },

  async executeOrder(payload: ExecuteTradePayload): Promise<ExecuteTradeResult> {
    const preview = await this.previewOrder(payload);
    const existingProfile = await UserDataService.getProfile(payload.userId);
    TransactionGuardService.validateUserStatus(existingProfile);

    if (preview.side === 'BUY') {
      TransactionGuardService.validateBalance(existingProfile, preview.grossAmountUsd);
    } else if (!String(payload.sellDisclosureSignature || '').trim()) {
      throw new Error('Sell disclosure signature is required before executing sell orders.');
    }

    if (!config.trading.providerEnabled) {
      const failedOrderId = await FinancePersistenceService.createCryptoOrder({
        userId: payload.userId,
        symbol: preview.symbol,
        side: preview.side,
        grossAmountUsd: preview.grossAmountUsd,
        feeUsd: preview.feeUsd,
        netAmountUsd: preview.netAmountUsd,
        quantity: preview.estimatedQuantity,
        executedPriceUsd: preview.priceUsd,
        status: 'failed',
        provider: getProviderName(),
        failureReason: 'Trade provider is disabled in configuration.',
        metadata: {
          reason: 'TRADING_PROVIDER_DISABLED',
        },
      });

      throw new Error(
        `Trade execution is disabled. Enable TRADING_PROVIDER_ENABLED to process ${preview.side} orders. Reference: ${failedOrderId || 'n/a'}`
      );
    }

    const updatedProfile = await UserDataService.updateProfile(payload.userId, (profile) => {
      const portfolio = Array.isArray(profile.portfolio) ? [...profile.portfolio] : [];
      const currentBalance = Number(profile.balance || 0);

      if (preview.side === 'BUY') {
        if (currentBalance < preview.grossAmountUsd) {
          throw new Error('Insufficient balance to complete this buy order.');
        }

        const nextBalance = roundUsd(currentBalance - preview.grossAmountUsd);
        const existing = portfolio.find((item) => item.symbol === preview.symbol);

        if (existing) {
          const oldValue = existing.amount * existing.avgBuyPrice;
          const newValue = preview.estimatedQuantity * preview.priceUsd;
          const nextQuantity = roundQty(existing.amount + preview.estimatedQuantity);

          existing.amount = nextQuantity;
          existing.avgBuyPrice = roundUsd((oldValue + newValue) / nextQuantity);
        } else {
          portfolio.push({
            assetId: preview.symbol.toLowerCase(),
            symbol: preview.symbol,
            amount: preview.estimatedQuantity,
            avgBuyPrice: preview.priceUsd,
          });
        }

        return {
          ...profile,
          balance: nextBalance,
          portfolio,
        };
      }

      const existing = portfolio.find((item) => item.symbol === preview.symbol);
      if (!existing || existing.amount < preview.estimatedQuantity) {
        throw new Error(`Insufficient ${preview.symbol} holdings to complete this sell order.`);
      }

      existing.amount = roundQty(existing.amount - preview.estimatedQuantity);
      const cleanedPortfolio = portfolio.filter((item) => item.amount > 0.00000001);

      return {
        ...profile,
        balance: roundUsd(currentBalance + preview.netAmountUsd),
        portfolio: cleanedPortfolio,
      };
    });

    const orderId = await FinancePersistenceService.createCryptoOrder({
      userId: payload.userId,
      symbol: preview.symbol,
      side: preview.side,
      grossAmountUsd: preview.grossAmountUsd,
      feeUsd: preview.feeUsd,
      netAmountUsd: preview.netAmountUsd,
      quantity: preview.estimatedQuantity,
      executedPriceUsd: preview.priceUsd,
      status: 'succeeded',
      provider: getProviderName(),
      metadata: {
        sell_disclosure_signature: payload.sellDisclosureSignature || null,
      },
    });

    const ledgerId = await FinancePersistenceService.insertLedgerTransaction({
      userId: payload.userId,
      type: preview.side === 'BUY' ? 'buy' : 'sell',
      amountUsd: preview.grossAmountUsd,
      feeUsd: preview.feeUsd,
      netAmountUsd: preview.netAmountUsd,
      status: 'completed',
      provider: getProviderName(),
      referenceId: orderId || undefined,
      metadata: {
        symbol: preview.symbol,
        quantity: preview.estimatedQuantity,
        price_usd: preview.priceUsd,
        sell_disclosure_signature: payload.sellDisclosureSignature || null,
      },
    });

    await FinancePersistenceService.insertFeeAccrual({
      userId: payload.userId,
      action: preview.side === 'BUY' ? 'buy_crypto' : 'sell_crypto',
      feeUsd: preview.feeUsd,
      ledgerTransactionId: ledgerId,
      referenceId: orderId || undefined,
      settlementStatus: 'pending',
      metadata: {
        provider: 'stripe',
        symbol: preview.symbol,
      },
    });

    return {
      orderId,
      ledgerId,
      balanceUsd: roundUsd(Number(updatedProfile.balance || 0)),
      symbol: preview.symbol,
      side: preview.side,
      feeUsd: preview.feeUsd,
      grossAmountUsd: preview.grossAmountUsd,
      netAmountUsd: preview.netAmountUsd,
      quantity: preview.estimatedQuantity,
      priceUsd: preview.priceUsd,
      provider: getProviderName(),
    };
  },
};
