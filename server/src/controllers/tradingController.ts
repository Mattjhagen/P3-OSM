import { NextFunction, Request, Response } from 'express';
import { MarketPriceService } from '../services/marketPriceService';
import { TradingService } from '../services/tradingService';

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
      const quotes = await MarketPriceService.getQuotes(symbols);

      return res.status(200).json({
        success: true,
        data: {
          quotes,
          symbols: Object.keys(quotes),
          fetchedAt: new Date().toISOString(),
          source: 'coingecko',
          cacheTtlSeconds: Number(process.env.COINGECKO_CACHE_SECONDS || 20),
        },
      });
    } catch (error) {
      next(attachStatus(error));
    }
  },

  previewOrder: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId, symbol, side, amountUsd } = req.body || {};

      const preview = await TradingService.previewOrder({
        userId: String(userId || ''),
        symbol: String(symbol || ''),
        side: side === 'SELL' ? 'SELL' : 'BUY',
        amountUsd: Number(amountUsd || 0),
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
      const { userId, symbol, side, amountUsd, sellDisclosureSignature, settlementAccount } = req.body || {};

      const result = await TradingService.executeOrder({
        userId: String(userId || ''),
        symbol: String(symbol || ''),
        side: side === 'SELL' ? 'SELL' : 'BUY',
        amountUsd: Number(amountUsd || 0),
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
