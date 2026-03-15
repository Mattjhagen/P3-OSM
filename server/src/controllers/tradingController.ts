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
      const uid = req.auth?.userId || String(userId || '');
      if (!uid) {
        return res.status(401).json({ success: false, error: 'Unauthenticated.' });
      }
      if (req.auth?.userId && userId !== undefined && String(userId).trim() !== req.auth.userId) {
        return res.status(403).json({ success: false, error: 'Forbidden: cannot preview order for another user.' });
      }
      await ComplianceService.requireFeatureApproval(uid, 'TRADE_CRYPTO');

      const sym = String(symbol || '').trim().toUpperCase();
      if (!sym) {
        return res.status(400).json({ success: false, error: 'symbol is required.' });
      }
      const amtUsd = Number(amountUsd);
      const amtFiat = Number(amountFiat || 0);
      if (!Number.isFinite(amtUsd) && !Number.isFinite(amtFiat)) {
        return res.status(400).json({ success: false, error: 'amountUsd or amountFiat must be a number.' });
      }
      const preview = await TradingService.previewOrder({
        userId: uid,
        symbol: sym,
        side: side === 'SELL' ? 'SELL' : 'BUY',
        amountUsd: Number.isFinite(amtUsd) ? amtUsd : 0,
        amountFiat: Number.isFinite(amtFiat) ? amtFiat : 0,
        fiatCurrency: typeof fiatCurrency === 'string' ? fiatCurrency.trim().toUpperCase() : undefined,
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
      const uid = req.auth?.userId || String(userId || '');
      if (!uid) {
        return res.status(401).json({ success: false, error: 'Unauthenticated.' });
      }
      if (req.auth?.userId && userId !== undefined && String(userId).trim() !== req.auth.userId) {
        return res.status(403).json({ success: false, error: 'Forbidden: cannot execute order for another user.' });
      }
      await ComplianceService.requireFeatureApproval(uid, 'TRADE_CRYPTO');
      const sym = String(symbol || '').trim().toUpperCase();
      if (!sym) {
        return res.status(400).json({ success: false, error: 'symbol is required.' });
      }
      const amtUsd = Number(amountUsd);
      const amtFiat = Number(amountFiat || 0);
      if (!Number.isFinite(amtUsd) && !Number.isFinite(amtFiat)) {
        return res.status(400).json({ success: false, error: 'amountUsd or amountFiat must be a number.' });
      }
      const result = await TradingService.executeOrder({
        userId: uid,
        symbol: sym,
        side: side === 'SELL' ? 'SELL' : 'BUY',
        amountUsd: Number.isFinite(amtUsd) ? amtUsd : 0,
        amountFiat: Number.isFinite(amtFiat) ? amtFiat : 0,
        fiatCurrency: typeof fiatCurrency === 'string' ? fiatCurrency.trim().toUpperCase() : undefined,
        sellDisclosureSignature: typeof sellDisclosureSignature === 'string' ? sellDisclosureSignature.slice(0, 1024) : undefined,
        settlementAccount: typeof settlementAccount === 'string' ? settlementAccount.trim().slice(0, 256) : undefined,
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
