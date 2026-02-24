import { NextFunction, Request, Response } from 'express';
import { MarketPriceService } from '../services/marketPriceService';
import { TradingService } from '../services/tradingService';
import { ComplianceService } from '../services/complianceService';

const parseSymbolsQuery = (value: unknown): string[] => {
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
};

const attachStatus = (error: any) => {
  if (typeof error?.status === 'number') {
    return error;
  }

  const message = String(error?.message || '').toLowerCase();
  if (message.includes('not configured') || message.includes('disabled')) {
    error.status = 503;
    return error;
  }
  if (
    message.includes('required') ||
    message.includes('must be') ||
    message.includes('unsupported') ||
    message.includes('insufficient') ||
    message.includes('too small')
  ) {
    error.status = 400;
  }
  return error;
};

export const TradingController = {
  getPrices: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const symbols = parseSymbolsQuery(req.query.symbols);
      const fiatCurrency =
        typeof req.query.fiat === 'string' && req.query.fiat.trim()
          ? req.query.fiat.trim().toUpperCase()
          : 'USD';
      const quotes = await MarketPriceService.getQuotes(symbols, fiatCurrency);
      const returnedFiat =
        Object.values(quotes)[0]?.fiatCurrency || fiatCurrency;

      return res.status(200).json({
        success: true,
        data: {
          quotes,
          symbols: Object.keys(quotes),
          fiatCurrency: returnedFiat,
          supportedFiatCurrencies: MarketPriceService.supportedFiatCurrencies,
          fetchedAt: new Date().toISOString(),
          source: 'bitstamp',
        },
      });
    } catch (error) {
      next(attachStatus(error));
    }
  },

  previewOrder: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId, symbol, side, amountUsd, amountFiat, fiatCurrency } = req.body || {};
      await ComplianceService.requireFeatureApproval(String(userId || ''), 'TRADE_CRYPTO');

      const preview = await TradingService.previewOrder({
        userId: String(userId || ''),
        symbol: String(symbol || ''),
        side: side === 'SELL' ? 'SELL' : 'BUY',
        amountUsd: Number(amountUsd || 0),
        amountFiat: Number(amountFiat || 0),
        fiatCurrency: typeof fiatCurrency === 'string' ? fiatCurrency : undefined,
      });

      return res.status(200).json({
        success: true,
        data: preview,
      });
    } catch (error) {
      next(attachStatus(error));
    }
  },

  executeOrder: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        userId,
        symbol,
        side,
        amountUsd,
        amountFiat,
        fiatCurrency,
        sellDisclosureSignature,
        settlementAccount,
      } = req.body || {};
      await ComplianceService.requireFeatureApproval(String(userId || ''), 'TRADE_CRYPTO');

      const result = await TradingService.executeOrder({
        userId: String(userId || ''),
        symbol: String(symbol || ''),
        side: side === 'SELL' ? 'SELL' : 'BUY',
        amountUsd: Number(amountUsd || 0),
        amountFiat: Number(amountFiat || 0),
        fiatCurrency: typeof fiatCurrency === 'string' ? fiatCurrency : undefined,
        sellDisclosureSignature: typeof sellDisclosureSignature === 'string' ? sellDisclosureSignature : undefined,
        settlementAccount: typeof settlementAccount === 'string' ? settlementAccount : undefined,
      });

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(attachStatus(error));
    }
  },
};
