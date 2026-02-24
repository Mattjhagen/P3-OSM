import { PriceService } from './crypto/priceService';

export interface PriceQuote {
  symbol: string;
  coinId: string;
  fiatCurrency: string;
  usd: number;
  usd24hChange: number;
  usdMarketCap: number;
  localPrice: number;
  local24hChange: number;
  localMarketCap: number;
  localToUsdRate: number;
  fetchedAt: string;
}

const SYMBOL_TO_MARKET = {
  BTC: 'btcusd',
  ETH: 'ethusd',
  SOL: 'solusd',
  DOGE: 'dogeusd',
  LINK: 'linkusd',
  AAVE: 'aaveusd',
  UNI: 'uniusd',
} as const;

const normalizeSymbol = (symbol: string) => symbol.trim().toUpperCase();

const toQuote = (symbol: string, price: number, ts: string): PriceQuote => ({
  symbol,
  coinId: symbol.toLowerCase(),
  fiatCurrency: 'USD',
  usd: price,
  usd24hChange: 0,
  usdMarketCap: 0,
  localPrice: price,
  local24hChange: 0,
  localMarketCap: 0,
  localToUsdRate: 1,
  fetchedAt: ts,
});

export const MarketPriceService = {
  supportedSymbols: Object.keys(SYMBOL_TO_MARKET),
  supportedFiatCurrencies: ['USD'],

  async getQuotes(symbols: string[] = [], fiatCurrency?: string): Promise<Record<string, PriceQuote>> {
    if (fiatCurrency && fiatCurrency.toUpperCase() !== 'USD') {
      throw new Error("Unsupported fiat currency. Bitstamp integration currently supports 'USD' only.");
    }

    const requested = (symbols.length ? symbols : this.supportedSymbols)
      .map(normalizeSymbol)
      .filter((symbol): symbol is keyof typeof SYMBOL_TO_MARKET => symbol in SYMBOL_TO_MARKET);

    const quotes: Record<string, PriceQuote> = {};

    await Promise.all(
      requested.map(async (symbol) => {
        const ticker = await PriceService.getPrice(symbol);
        quotes[symbol] = toQuote(symbol, ticker.price, ticker.ts);
      })
    );

    return quotes;
  },

  async getSpotPrice(symbol: string, fiatCurrency?: string): Promise<PriceQuote> {
    const normalized = normalizeSymbol(symbol);
    if (!(normalized in SYMBOL_TO_MARKET)) {
      throw new Error(`Unsupported symbol '${symbol}'.`);
    }

    const ticker = await PriceService.getPrice(normalized);
    return toQuote(normalized, ticker.price, ticker.ts);
  },
};
