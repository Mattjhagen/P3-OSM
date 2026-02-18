import { config } from '../config/config';
import { FeePolicyService } from './feePolicyService';
import { FinancePersistenceService } from './financePersistenceService';
import { MarketPriceService } from './marketPriceService';
import { recordTradeNotificationBestEffort } from './notificationEventService';
import { TransactionGuardService } from './transactionGuardService';
import { UserDataService } from './userDataService';

const roundUsd = (value: number) => Math.round(value * 100) / 100;
const roundQty = (value: number) => Math.round(value * 1e8) / 1e8;
const roundRate = (value: number) => Math.round(value * 1e8) / 1e8;

export interface TradeOrderPreview {
  symbol: string;
  side: 'BUY' | 'SELL';
  fiatCurrency: string;
  requestedAmountLocal: number;
  grossAmountLocal: number;
  feeLocal: number;
  netAmountLocal: number;
  grossAmountUsd: number;
  feeUsd: number;
  netAmountUsd: number;
  estimatedQuantity: number;
  priceLocal: number;
  priceUsd: number;
  localToUsdRate: number;
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
  amountFiat?: number;
  fiatCurrency?: string;
  sellDisclosureSignature?: string;
  settlementAccount?: string;
}

export interface ExecuteTradeResult {
  orderId: string | null;
  ledgerId: string | null;
  balanceUsd: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  fiatCurrency: string;
  grossAmountLocal: number;
  feeLocal: number;
  netAmountLocal: number;
  feeUsd: number;
  grossAmountUsd: number;
  netAmountUsd: number;
  quantity: number;
  priceLocal: number;
  priceUsd: number;
  provider: string;
}

const normalizeSymbol = (symbol: string) => symbol.trim().toUpperCase();

const getProviderName = () => (config.trading.providerEnabled ? 'INTERNAL_LEDGER' : 'DISABLED');

export const TradingService = {
  async previewOrder(payload: ExecuteTradePayload): Promise<TradeOrderPreview> {
    const symbol = normalizeSymbol(payload.symbol);
    const side = payload.side;
    const fiatCurrency = String(payload.fiatCurrency || 'USD').trim().toUpperCase();
    const requestedAmountLocal = Number(
      Number.isFinite(payload.amountFiat as number) && Number(payload.amountFiat) > 0
        ? payload.amountFiat
        : payload.amountUsd
    );

    if (!payload.userId || !payload.userId.trim()) {
      throw new Error('userId is required.');
    }

    if (side !== 'BUY' && side !== 'SELL') {
      throw new Error('side must be BUY or SELL.');
    }

    if (!Number.isFinite(requestedAmountLocal) || requestedAmountLocal <= 0) {
      throw new Error('amountFiat (or amountUsd) must be a positive number.');
    }

    const quote = await MarketPriceService.getSpotPrice(symbol, fiatCurrency);
    const localToUsdRate =
      Number.isFinite(quote.localToUsdRate) && quote.localToUsdRate > 0
        ? quote.localToUsdRate
        : quote.usd / quote.localPrice;
    const grossAmountUsd = roundUsd(requestedAmountLocal * localToUsdRate);
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
      fiatCurrency,
      requestedAmountLocal: roundUsd(requestedAmountLocal),
      grossAmountLocal: roundUsd(fee.grossAmountUsd / localToUsdRate),
      feeLocal: roundUsd(fee.feeTotalUsd / localToUsdRate),
      netAmountLocal: roundUsd(fee.netAmountUsd / localToUsdRate),
      grossAmountUsd: fee.grossAmountUsd,
      feeUsd: fee.feeTotalUsd,
      netAmountUsd: fee.netAmountUsd,
      estimatedQuantity,
      priceLocal: quote.localPrice,
      priceUsd: quote.usd,
      localToUsdRate: roundRate(localToUsdRate),
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
    const settlementAccount =
      preview.side === 'SELL' ? String(payload.settlementAccount || '').trim() || null : null;
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
          fiat_currency: preview.fiatCurrency,
          gross_amount_local: preview.grossAmountLocal,
          fee_local: preview.feeLocal,
          net_amount_local: preview.netAmountLocal,
          requested_amount_local: preview.requestedAmountLocal,
          price_local: preview.priceLocal,
          local_to_usd_rate: preview.localToUsdRate,
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
        settlement_account: settlementAccount,
        fiat_currency: preview.fiatCurrency,
        gross_amount_local: preview.grossAmountLocal,
        fee_local: preview.feeLocal,
        net_amount_local: preview.netAmountLocal,
        requested_amount_local: preview.requestedAmountLocal,
        price_local: preview.priceLocal,
        local_to_usd_rate: preview.localToUsdRate,
      },
    });

    const ledgerId = await FinancePersistenceService.insertLedgerTransaction({
      userId: payload.userId,
      type: preview.side === 'BUY' ? 'buy' : 'sell',
      amountUsd: preview.grossAmountUsd,
      feeUsd: preview.feeUsd,
      netAmountUsd: preview.netAmountUsd,
      status: 'completed',
      currency: preview.fiatCurrency,
      provider: getProviderName(),
      referenceId: orderId || undefined,
      metadata: {
        symbol: preview.symbol,
        quantity: preview.estimatedQuantity,
        price_usd: preview.priceUsd,
        price_local: preview.priceLocal,
        fiat_currency: preview.fiatCurrency,
        gross_amount_local: preview.grossAmountLocal,
        fee_local: preview.feeLocal,
        net_amount_local: preview.netAmountLocal,
        requested_amount_local: preview.requestedAmountLocal,
        local_to_usd_rate: preview.localToUsdRate,
        sell_disclosure_signature: payload.sellDisclosureSignature || null,
        settlement_account: settlementAccount,
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
        settlement_account: settlementAccount,
        fiat_currency: preview.fiatCurrency,
      },
    });

    await recordTradeNotificationBestEffort({
      userId: payload.userId,
      email: updatedProfile.email,
      orderId,
      ledgerId,
      symbol: preview.symbol,
      side: preview.side,
      amountUsd: preview.grossAmountUsd,
      netAmountUsd: preview.netAmountUsd,
      feeUsd: preview.feeUsd,
      fiatCurrency: preview.fiatCurrency,
    });

    return {
      orderId,
      ledgerId,
      balanceUsd: roundUsd(Number(updatedProfile.balance || 0)),
      symbol: preview.symbol,
      side: preview.side,
      fiatCurrency: preview.fiatCurrency,
      grossAmountLocal: preview.grossAmountLocal,
      feeLocal: preview.feeLocal,
      netAmountLocal: preview.netAmountLocal,
      feeUsd: preview.feeUsd,
      grossAmountUsd: preview.grossAmountUsd,
      netAmountUsd: preview.netAmountUsd,
      quantity: preview.estimatedQuantity,
      priceLocal: preview.priceLocal,
      priceUsd: preview.priceUsd,
      provider: getProviderName(),
    };
  },
};
