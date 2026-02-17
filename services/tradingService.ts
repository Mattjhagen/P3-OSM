import { frontendEnv } from './env';
import { RuntimeConfigService } from './runtimeConfigService';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');
const normalizeBackendBaseUrl = (value: string) =>
  trimTrailingSlash(value).replace(/\/api$/i, '');

const getBackendBaseUrl = () =>
  normalizeBackendBaseUrl(
    RuntimeConfigService.getEffectiveValue('BACKEND_URL', frontendEnv.VITE_BACKEND_URL)
  );

const parseSellCryptoAccounts = (): Record<string, string> => {
  const raw = RuntimeConfigService.getConfigValue('SELL_CRYPTO_ACCOUNTS');
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};

    return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, string>>(
      (acc, [symbol, destination]) => {
        const normalizedSymbol = String(symbol || '').trim().toUpperCase();
        const normalizedDestination = String(destination || '').trim();
        if (!normalizedSymbol || !normalizedDestination) return acc;
        acc[normalizedSymbol] = normalizedDestination;
        return acc;
      },
      {}
    );
  } catch {
    return {};
  }
};

const resolveSettlementAccount = (symbol: string): string | undefined => {
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!normalizedSymbol) return undefined;
  const accounts = parseSellCryptoAccounts();
  return accounts[normalizedSymbol];
};

const normalizeFetchError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '');
  const lower = message.toLowerCase();
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('load failed')
  ) {
    return 'Trading backend is unavailable right now (Render may be down).';
  }
  return message || 'Unable to reach trading backend.';
};

const parseApiResponse = async (response: Response) => {
  let body: any = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok || !body?.success) {
    throw new Error(body?.error || `Request failed (${response.status})`);
  }

  return body.data;
};

export interface PriceQuoteDto {
  symbol: string;
  usd: number;
  usd24hChange: number;
  usdMarketCap: number;
  fetchedAt: string;
}

export interface OrderPreviewDto {
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

export interface OrderExecutionDto {
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

export interface WithdrawalDto {
  requestId: string | null;
  ledgerId: string | null;
  method: 'STRIPE' | 'BTC';
  grossAmountUsd: number;
  feeUsd: number;
  payoutAmountUsd: number;
  provider: string;
  providerReference: string | null;
  balanceUsd: number;
  destination: string;
  estimatedBtc?: number;
}

export const TradingService = {
  getPrices: async (symbols: string[]) => {
    const query = encodeURIComponent(symbols.join(','));

    let response: Response;
    try {
      response = await fetch(`${getBackendBaseUrl()}/api/prices?symbols=${query}`, {
        method: 'GET',
      });
    } catch (error) {
      throw new Error(normalizeFetchError(error));
    }

    const data = await parseApiResponse(response);
    return (data?.quotes || {}) as Record<string, PriceQuoteDto>;
  },

  previewOrder: async (payload: {
    userId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    amountUsd: number;
  }) => {
    let response: Response;
    try {
      response = await fetch(`${getBackendBaseUrl()}/api/trading/orders/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      throw new Error(normalizeFetchError(error));
    }

    return (await parseApiResponse(response)) as OrderPreviewDto;
  },

  executeOrder: async (payload: {
    userId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    amountUsd: number;
    sellDisclosureSignature?: string;
    settlementAccount?: string;
  }) => {
    const symbol = String(payload.symbol || '').trim().toUpperCase();
    const settlementAccount =
      payload.side === 'SELL'
        ? String(payload.settlementAccount || '').trim() || resolveSettlementAccount(symbol)
        : undefined;

    let response: Response;
    try {
      response = await fetch(`${getBackendBaseUrl()}/api/trading/orders/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...payload,
          symbol,
          settlementAccount,
        }),
      });
    } catch (error) {
      throw new Error(normalizeFetchError(error));
    }

    return (await parseApiResponse(response)) as OrderExecutionDto;
  },

  requestWithdrawal: async (payload: {
    userId: string;
    method: 'STRIPE' | 'BTC';
    amountUsd: number;
    destination: string;
  }) => {
    let response: Response;
    try {
      response = await fetch(`${getBackendBaseUrl()}/api/withdrawals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      throw new Error(normalizeFetchError(error));
    }

    return (await parseApiResponse(response)) as WithdrawalDto;
  },

  createPlaidLinkToken: async (payload: { userId: string; email?: string }) => {
    let response: Response;
    try {
      response = await fetch(`${getBackendBaseUrl()}/api/plaid/link-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      throw new Error(normalizeFetchError(error));
    }

    return parseApiResponse(response);
  },

  exchangePlaidPublicToken: async (payload: {
    userId: string;
    publicToken: string;
    accountId?: string;
  }) => {
    let response: Response;
    try {
      response = await fetch(`${getBackendBaseUrl()}/api/plaid/exchange-public-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      throw new Error(normalizeFetchError(error));
    }

    return parseApiResponse(response);
  },
};
