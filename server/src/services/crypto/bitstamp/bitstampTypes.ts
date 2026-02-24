export type BitstampEnv = 'sandbox' | 'prod';

export interface NormalizedPrice {
  provider: 'bitstamp';
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  ts: string;
}

export interface BitstampTickerItem {
  market: string;
  timestamp?: string;
  last?: string;
  bid?: string;
  ask?: string;
}

export interface BitstampUserTransaction {
  id: string;
  datetime: string;
  type: string;
  usd?: string;
  btc?: string;
  fee?: string;
  order_id?: string;
  [key: string]: string | undefined;
}

export interface BitstampRequestOptions {
  method: 'GET' | 'POST';
  path: string;
  query?: URLSearchParams;
  body?: URLSearchParams;
  auth?: boolean;
  timeoutMs?: number;
}
