import { config } from '../config/config';
import logger from '../utils/logger';

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

const SYMBOL_TO_COINGECKO_ID: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  DOGE: 'dogecoin',
  LINK: 'chainlink',
  AAVE: 'aave',
  UNI: 'uniswap',
};

const SUPPORTED_FIAT_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'AUD',
  'JPY',
  'CHF',
  'MXN',
  'BRL',
  'INR',
  'SGD',
] as const;

const COINGECKO_ID_TO_SYMBOL = Object.entries(SYMBOL_TO_COINGECKO_ID).reduce<Record<string, string>>(
  (acc, [symbol, coinId]) => {
    acc[coinId] = symbol;
    return acc;
  },
  {}
);

type FiatCacheEntry = {
  cacheExpiresAt: number;
  quotes: Record<string, PriceQuote>;
};

const quoteCacheByFiat: Record<string, FiatCacheEntry> = {};

const normalizeSymbol = (symbol: string) => symbol.trim().toUpperCase();

const normalizeFiatCurrency = (fiatCurrency?: string) => {
  const normalized = String(fiatCurrency || 'USD').trim().toUpperCase();
  if (!normalized) return 'USD';
  if (!SUPPORTED_FIAT_CURRENCIES.includes(normalized as (typeof SUPPORTED_FIAT_CURRENCIES)[number])) {
    throw new Error(
      `Unsupported fiat currency '${normalized}'. Supported currencies: ${SUPPORTED_FIAT_CURRENCIES.join(', ')}.`
    );
  }
  return normalized;
};

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

const getCoinGeckoUrl = (symbols: string[], fiatCurrency: string) => {
  const ids = symbols.map((symbol) => SYMBOL_TO_COINGECKO_ID[symbol]).join(',');
  const fiatLower = fiatCurrency.toLowerCase();
  const vsCurrencies =
    fiatCurrency === 'USD' ? 'usd' : Array.from(new Set(['usd', fiatLower])).join(',');
  const params = new URLSearchParams({
    ids,
    vs_currencies: vsCurrencies,
    include_24hr_change: 'true',
    include_market_cap: 'true',
  });

  // CoinGecko demo accounts use x_cg_demo_api_key query parameter.
  if (config.coingecko.apiKey) {
    params.set('x_cg_demo_api_key', config.coingecko.apiKey);
  }

  return `${config.coingecko.apiBaseUrl.replace(/\/+$/, '')}/simple/price?${params.toString()}`;
};

const getCacheEntry = (fiatCurrency: string): FiatCacheEntry => {
  const existing = quoteCacheByFiat[fiatCurrency];
  if (existing) return existing;

  const created: FiatCacheEntry = {
    cacheExpiresAt: 0,
    quotes: {},
  };
  quoteCacheByFiat[fiatCurrency] = created;
  return created;
};

const hasFreshCache = (fiatCurrency: string) => Date.now() < getCacheEntry(fiatCurrency).cacheExpiresAt;

const mapPayloadToQuotes = (
  payload: Record<string, Record<string, number | undefined>>,
  fiatCurrency: string,
  fetchedAt: string
): Record<string, PriceQuote> => {
  const mapped: Record<string, PriceQuote> = {};
  const fiatLower = fiatCurrency.toLowerCase();
  const localPriceKey = fiatCurrency === 'USD' ? 'usd' : fiatLower;
  const localChangeKey = fiatCurrency === 'USD' ? 'usd_24h_change' : `${fiatLower}_24h_change`;
  const localMarketCapKey = fiatCurrency === 'USD' ? 'usd_market_cap' : `${fiatLower}_market_cap`;

  for (const [coinId, quote] of Object.entries(payload || {})) {
    const symbol = COINGECKO_ID_TO_SYMBOL[coinId];
    if (!symbol) continue;

    const usd = Number(quote?.usd || 0);
    if (!Number.isFinite(usd) || usd <= 0) continue;
    const localPrice = Number(quote?.[localPriceKey] || 0);
    if (!Number.isFinite(localPrice) || localPrice <= 0) continue;
    const localToUsdRate = usd / localPrice;

    mapped[symbol] = {
      symbol,
      coinId,
      fiatCurrency,
      usd,
      usd24hChange: Number(quote?.usd_24h_change || 0),
      usdMarketCap: Number(quote?.usd_market_cap || 0),
      localPrice,
      local24hChange: Number(quote?.[localChangeKey] || 0),
      localMarketCap: Number(quote?.[localMarketCapKey] || 0),
      localToUsdRate: Number.isFinite(localToUsdRate) && localToUsdRate > 0 ? localToUsdRate : 1,
      fetchedAt,
    };
  }

  return mapped;
};

const fetchQuotes = async (
  symbols: string[],
  fiatCurrency: string
): Promise<Record<string, PriceQuote>> => {
  const url = getCoinGeckoUrl(symbols, fiatCurrency);
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

  const json = (await response.json()) as Record<string, Record<string, number | undefined>>;

  return mapPayloadToQuotes(json, fiatCurrency, new Date().toISOString());
};

export const MarketPriceService = {
  supportedSymbols: Object.keys(SYMBOL_TO_COINGECKO_ID),
  supportedFiatCurrencies: Array.from(SUPPORTED_FIAT_CURRENCIES),

  async getQuotes(symbols: string[] = [], fiatCurrency?: string): Promise<Record<string, PriceQuote>> {
    const normalizedFiatCurrency = normalizeFiatCurrency(fiatCurrency);
    const requested = normalizeSymbols(symbols);
    const cacheEntry = getCacheEntry(normalizedFiatCurrency);

    if (hasFreshCache(normalizedFiatCurrency) && requested.every((symbol) => Boolean(cacheEntry.quotes[symbol]))) {
      return requested.reduce<Record<string, PriceQuote>>((acc, symbol) => {
        acc[symbol] = cacheEntry.quotes[symbol];
        return acc;
      }, {});
    }

    const fetched = await fetchQuotes(requested, normalizedFiatCurrency);

    if (Object.keys(fetched).length === 0) {
      logger.warn({ requested, fiatCurrency: normalizedFiatCurrency }, 'CoinGecko returned no quotes for requested symbols');
    }

    cacheEntry.quotes = {
      ...cacheEntry.quotes,
      ...fetched,
    };

    cacheEntry.cacheExpiresAt = Date.now() + Math.max(5, config.coingecko.cacheSeconds) * 1000;

    return requested.reduce<Record<string, PriceQuote>>((acc, symbol) => {
      const quote = cacheEntry.quotes[symbol];
      if (quote) acc[symbol] = quote;
      return acc;
    }, {});
  },

  async getSpotPrice(symbol: string, fiatCurrency?: string): Promise<PriceQuote> {
    const normalized = normalizeSymbol(symbol);
    if (!SYMBOL_TO_COINGECKO_ID[normalized]) {
      throw new Error(`Unsupported symbol '${symbol}'.`);
    }

    const quotes = await this.getQuotes([normalized], fiatCurrency);
    const quote = quotes[normalized];

    if (!quote) {
      throw new Error(`No live quote available for ${normalized}.`);
    }

    return quote;
  },
};
