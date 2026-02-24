import { getCryptoProvider } from './providers';
import { NormalizedPrice } from './bitstamp/bitstampTypes';

const DEFAULT_SYMBOLS = ['BTC', 'ETH', 'SOL', 'DOGE', 'LINK', 'AAVE', 'UNI'];

const toBitstampSymbol = (symbol: string, fiat = 'usd') => `${symbol.trim().toLowerCase()}${fiat.toLowerCase()}`;

export const PriceService = {
  supportedSymbols: DEFAULT_SYMBOLS,
  supportedFiatCurrencies: ['USD'],

  async getPrice(symbol: string): Promise<NormalizedPrice> {
    const provider = getCryptoProvider();
    const market = toBitstampSymbol(symbol, 'usd');
    return provider.client.getTicker(market);
  },

  async getPrices(symbols: string[] = []): Promise<Record<string, NormalizedPrice>> {
    const requested = symbols.length ? symbols : DEFAULT_SYMBOLS;
    const provider = getCryptoProvider();
    const result: Record<string, NormalizedPrice> = {};

    await Promise.all(
      requested.map(async (symbol) => {
        const quote = await provider.client.getTicker(toBitstampSymbol(symbol, 'usd'));
        result[symbol.toUpperCase()] = quote;
      })
    );

    return result;
  },

  async healthCheck(symbol = 'btcusd') {
    const provider = getCryptoProvider();
    return provider.client.healthCheck(symbol);
  },
};
