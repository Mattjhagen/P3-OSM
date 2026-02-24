/* eslint-disable no-console */
import crypto from 'crypto';

const BITSTAMP_ENV = (process.env.BITSTAMP_ENV || 'prod').toLowerCase() === 'sandbox' ? 'sandbox' : 'prod';
const BASE_URL = BITSTAMP_ENV === 'sandbox' ? 'https://www.bitstamp.net' : 'https://www.bitstamp.net';

const buildAuthHeaders = (method: string, path: string, body: string, contentType?: string) => {
  const apiKey = process.env.BITSTAMP_API_KEY || '';
  const apiSecret = process.env.BITSTAMP_API_SECRET || '';
  const host = new URL(BASE_URL).host;
  const nonce = crypto.randomUUID();
  const timestamp = Date.now().toString();
  const version = 'v2';
  const xAuth = `BITSTAMP ${apiKey}`;

  const message = xAuth + method + host + path + '' + (contentType || '') + nonce + timestamp + version + body;
  const signature = crypto.createHmac('sha256', apiSecret).update(message).digest('hex');

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Auth': xAuth,
    'X-Auth-Signature': signature,
    'X-Auth-Nonce': nonce,
    'X-Auth-Timestamp': timestamp,
    'X-Auth-Version': version,
  };

  if (contentType) headers['Content-Type'] = contentType;
  if (process.env.BITSTAMP_SUBACCOUNT_ID) headers['X-Auth-Subaccount-Id'] = process.env.BITSTAMP_SUBACCOUNT_ID;

  return headers;
};

const run = async () => {
  const tickerRes = await fetch(`${BASE_URL}/api/v2/ticker/btcusd/`, {
    headers: { Accept: 'application/json' },
  });

  if (!tickerRes.ok) {
    const body = await tickerRes.text().catch(() => '');
    throw new Error(`Ticker call failed (${tickerRes.status}): ${body}`);
  }

  const ticker = await tickerRes.json();
  console.log('public ticker ok', { market: 'btcusd', last: ticker?.last, bid: ticker?.bid, ask: ticker?.ask });

  if (!process.env.BITSTAMP_API_KEY || !process.env.BITSTAMP_API_SECRET) {
    console.log('private checks skipped (BITSTAMP_API_KEY/BITSTAMP_API_SECRET not set)');
    return;
  }

  const body = new URLSearchParams({ limit: '10', offset: '0' }).toString();
  const contentType = 'application/x-www-form-urlencoded';
  const txPath = '/api/v2/user_transactions/';
  const txRes = await fetch(`${BASE_URL}${txPath}`, {
    method: 'POST',
    headers: buildAuthHeaders('POST', txPath, body, contentType),
    body,
  });

  if (!txRes.ok) {
    const resBody = await txRes.text().catch(() => '');
    throw new Error(`User transactions failed (${txRes.status}): ${resBody}`);
  }

  const tx = await txRes.json();
  console.log('private user_transactions ok', { count: Array.isArray(tx) ? tx.length : 0 });
};

run().catch((error) => {
  console.error('bitstamp smoke failed', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
