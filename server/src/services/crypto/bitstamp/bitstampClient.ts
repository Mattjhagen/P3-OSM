import { config } from '../../../config/config';
import logger from '../../../utils/logger';
import { createBitstampAuthHeaders } from './bitstampAuth';
import { BitstampRequestOptions, BitstampTickerItem, BitstampUserTransaction, NormalizedPrice } from './bitstampTypes';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;
const BITSTAMP_PROD_BASE_URL = 'https://www.bitstamp.net';
const BITSTAMP_SANDBOX_BASE_URL = 'https://www.sandbox.bitstamp.net';

const getBaseUrl = () =>
  config.crypto.bitstamp.env === 'sandbox' ? BITSTAMP_SANDBOX_BASE_URL : BITSTAMP_PROD_BASE_URL;

const parseNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeTicker = (item: BitstampTickerItem): NormalizedPrice | null => {
  const symbol = String(item.market || '').trim().toUpperCase();
  const price = parseNumber(item.last);
  const bid = parseNumber(item.bid);
  const ask = parseNumber(item.ask);

  if (!symbol || !price) return null;

  const ts = item.timestamp ? new Date(Number(item.timestamp) * 1000).toISOString() : new Date().toISOString();

  return {
    provider: 'bitstamp',
    symbol,
    price,
    bid,
    ask,
    ts,
  };
};

class BitstampHttpError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code = 'BITSTAMP_HTTP_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const wait = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const request = async <T>(options: BitstampRequestOptions): Promise<T> => {
  const baseUrl = getBaseUrl();
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const query = options.query?.toString() || '';
  const body = options.body?.toString() || '';
  const hasBody = Boolean(body);
  const contentType = hasBody ? 'application/x-www-form-urlencoded' : undefined;
  const url = `${baseUrl}${options.path}${query ? `?${query}` : ''}`;
  const host = new URL(baseUrl).host;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };

      if (options.auth) {
        if (!config.crypto.bitstamp.apiKey || !config.crypto.bitstamp.apiSecret) {
          throw new BitstampHttpError('Bitstamp private endpoint requested without API credentials.', 503, 'BITSTAMP_AUTH_NOT_CONFIGURED');
        }

        Object.assign(
          headers,
          createBitstampAuthHeaders({
            apiKey: config.crypto.bitstamp.apiKey,
            apiSecret: config.crypto.bitstamp.apiSecret,
            method: options.method,
            host,
            path: options.path,
            query: query ? `?${query}` : '',
            body,
            contentType,
            subaccountId: config.crypto.bitstamp.subaccountId,
          })
        );
      } else if (contentType) {
        headers['Content-Type'] = contentType;
      }

      const response = await fetch(url, {
        method: options.method,
        headers,
        body: hasBody ? body : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const responseText = await response.text().catch(() => '');
        const canRetry = response.status === 429 || response.status >= 500;

        if (canRetry && attempt < MAX_RETRIES) {
          await wait((attempt + 1) * 250);
          continue;
        }

        const safeMessage = responseText ? `: ${responseText.slice(0, 200)}` : '';
        throw new BitstampHttpError(
          `Bitstamp request failed (${response.status})${safeMessage}`,
          response.status,
          'BITSTAMP_UPSTREAM_ERROR'
        );
      }

      return (await response.json()) as T;
    } catch (error: any) {
      const canRetry = (error?.name === 'AbortError' || error?.status === 429 || error?.status >= 500) && attempt < MAX_RETRIES;
      if (canRetry) {
        await wait((attempt + 1) * 250);
        continue;
      }

      if (error instanceof BitstampHttpError) {
        throw error;
      }

      logger.warn({ err: error?.message, path: options.path, method: options.method }, 'Bitstamp request failed');
      throw new BitstampHttpError('Unable to reach Bitstamp endpoint.', 502, 'BITSTAMP_NETWORK_ERROR');
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new BitstampHttpError('Bitstamp request exhausted retry attempts.', 502);
};

export const BitstampClient = {
  async getTicker(marketSymbol: string): Promise<NormalizedPrice> {
    const normalizedSymbol = marketSymbol.trim().toLowerCase();
    const ticker = await request<BitstampTickerItem>({
      method: 'GET',
      path: `/api/v2/ticker/${normalizedSymbol}/`,
    });

    const normalized = normalizeTicker({ ...ticker, market: normalizedSymbol });
    if (!normalized) {
      throw new BitstampHttpError(`No ticker data for ${marketSymbol}`, 404, 'BITSTAMP_EMPTY_TICKER');
    }
    return normalized;
  },

  async getAllTickers(): Promise<NormalizedPrice[]> {
    const tickers = await request<BitstampTickerItem[]>({
      method: 'GET',
      path: '/api/v2/ticker/',
    });

    return (Array.isArray(tickers) ? tickers : [])
      .map((item) => normalizeTicker(item))
      .filter((item): item is NormalizedPrice => Boolean(item));
  },

  async getUserTransactions(params: { offset?: number; limit?: number } = {}): Promise<BitstampUserTransaction[]> {
    const body = new URLSearchParams();
    if (typeof params.offset === 'number') body.set('offset', String(params.offset));
    if (typeof params.limit === 'number') body.set('limit', String(params.limit));

    const response = await request<BitstampUserTransaction[]>({
      method: 'POST',
      path: '/api/v2/user_transactions/',
      body,
      auth: true,
    });

    return Array.isArray(response) ? response : [];
  },

  async getBalances(): Promise<Record<string, unknown>> {
    // TODO: wire /api/v2/balance/ once endpoint contract is confirmed in spec used by this repo.
    return {};
  },

  async healthCheck(symbol = 'btcusd'): Promise<{ ok: boolean; provider: string; symbol: string }> {
    await this.getTicker(symbol);
    return { ok: true, provider: 'bitstamp', symbol };
  },
};
