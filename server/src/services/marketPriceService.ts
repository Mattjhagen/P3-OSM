import { config } from '../config/config';
import logger from '../utils/logger';

export interface PriceQuote {
  symbol: string;
  coinId: string;
  usd: number;
  usd24hChange: number;
  usdMarketCap: number;
  fetchedAt: string;
}

const SYMBOL_TO_COINGECKO_ID: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  DOGE: 'dogecoin',
  LINK: 'chainlink',
  AAVE: 'aave',
  UNI: 'uniswap',
};

const COINGECKO_ID_TO_SYMBOL = Object.entries(SYMBOL_TO_COINGECKO_ID).reduce<Record<string, string>>(
  (acc, [symbol, coinId]) => {
    acc[coinId] = symbol;
    return acc;
  },
  {}
);

let cacheExpiresAt = 0;
let cachedQuotes: Record<string, PriceQuote> = {};

const normalizeSymbol = (symbol: string) => symbol.trim().toUpperCase();

const normalizeSymbols = (symbols: string[] = []): string[] => {
  const deduped = new Set<string>();

  for (const symbol of symbols) {
    const normalized = normalizeSymbol(symbol);
    if (!normalized || !SYMBOL_TO_COINGECKO_ID[normalized]) continue;
    deduped.add(normalized);
  }

  if (deduped.size === 0) {
    return Object.keys(SYMBOL_TO_COINGECKO_ID);
  }

  return Array.from(deduped);
};

const getCoinGeckoUrl = (symbols: string[]) => {
  const ids = symbols.map((symbol) => SYMBOL_TO_COINGECKO_ID[symbol]).join(',');
  const params = new URLSearchParams({
    ids,
    vs_currencies: 'usd',
    include_24hr_change: 'true',
    include_market_cap: 'true',
  });

  // CoinGecko demo accounts use x_cg_demo_api_key query parameter.
  if (config.coingecko.apiKey) {
    params.set('x_cg_demo_api_key', config.coingecko.apiKey);
  }

  return `${config.coingecko.apiBaseUrl.replace(/\/+$/, '')}/simple/price?${params.toString()}`;
};

const hasFreshCache = () => Date.now() < cacheExpiresAt;

const mapPayloadToQuotes = (
  payload: Record<string, { usd?: number; usd_24h_change?: number; usd_market_cap?: number }>,
  fetchedAt: string
): Record<string, PriceQuote> => {
  const mapped: Record<string, PriceQuote> = {};

  for (const [coinId, quote] of Object.entries(payload || {})) {
    const symbol = COINGECKO_ID_TO_SYMBOL[coinId];
    if (!symbol) continue;

    const usd = Number(quote?.usd || 0);
    if (!Number.isFinite(usd) || usd <= 0) continue;

    mapped[symbol] = {
      symbol,
      coinId,
      usd,
      usd24hChange: Number(quote?.usd_24h_change || 0),
      usdMarketCap: Number(quote?.usd_market_cap || 0),
      fetchedAt,
    };
  }

  return mapped;
};

const fetchQuotes = async (symbols: string[]): Promise<Record<string, PriceQuote>> => {
  const url = getCoinGeckoUrl(symbols);
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`CoinGecko request failed (${response.status}): ${body || 'empty body'}`);
  }

  const json = (await response.json()) as Record<string, {
    usd?: number;
    usd_24h_change?: number;
    usd_market_cap?: number;
  }>;

  return mapPayloadToQuotes(json, new Date().toISOString());
};

export const MarketPriceService = {
  supportedSymbols: Object.keys(SYMBOL_TO_COINGECKO_ID),

  async getQuotes(symbols: string[] = []): Promise<Record<string, PriceQuote>> {
    const requested = normalizeSymbols(symbols);

    if (hasFreshCache() && requested.every((symbol) => Boolean(cachedQuotes[symbol]))) {
      return requested.reduce<Record<string, PriceQuote>>((acc, symbol) => {
        acc[symbol] = cachedQuotes[symbol];
        return acc;
      }, {});
    }

    const fetched = await fetchQuotes(requested);

    if (Object.keys(fetched).length === 0) {
      logger.warn({ requested }, 'CoinGecko returned no quotes for requested symbols');
    }

    cachedQuotes = {
      ...cachedQuotes,
      ...fetched,
    };

    cacheExpiresAt = Date.now() + Math.max(5, config.coingecko.cacheSeconds) * 1000;

    return requested.reduce<Record<string, PriceQuote>>((acc, symbol) => {
      const quote = cachedQuotes[symbol];
      if (quote) acc[symbol] = quote;
      return acc;
    }, {});
  },

  async getSpotPrice(symbol: string): Promise<PriceQuote> {
    const normalized = normalizeSymbol(symbol);
    if (!SYMBOL_TO_COINGECKO_ID[normalized]) {
      throw new Error(`Unsupported symbol '${symbol}'.`);
    }

    const quotes = await this.getQuotes([normalized]);
    const quote = quotes[normalized];

    if (!quote) {
      throw new Error(`No live quote available for ${normalized}.`);
    }

    return quote;
  },
};
