/**
 * Bitstamp REST "real-time" monitor
 * - Measures staleness using ticker.timestamp (unix seconds).
 *
 * Run:
 *   npx tsx scripts/bitstamp_realtime_rest.ts btcusd 1000
 *
 * Args:
 *   pair (default btcusd)
 *   intervalMs (default 1000)
 */

const pair = (process.argv[2] || 'btcusd').toLowerCase();
const intervalMs = Number(process.argv[3] || '1000');

const defaultBaseUrl =
  (process.env.BITSTAMP_ENV || 'prod').toLowerCase() === 'sandbox'
    ? 'https://www.sandbox.bitstamp.net'
    : 'https://www.bitstamp.net';

const BASE_URL = process.env.BITSTAMP_BASE_URL || defaultBaseUrl;

type BitstampTicker = {
  last: string;
  bid: string;
  ask: string;
  timestamp: string;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithTimeout(url: string, ms = 10_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return res;
  } finally {
    clearTimeout(t);
  }
}

(async () => {
  console.log(`[bitstamp-rest] base=${BASE_URL} pair=${pair} intervalMs=${intervalMs}`);

  let lastSeen = '';
  while (true) {
    try {
      const url = `${BASE_URL}/api/v2/ticker/${pair}/`;
      const res = await fetchWithTimeout(url);
      const data = (await res.json()) as BitstampTicker;

      const tsMs = Number(data.timestamp) * 1000;
      const nowMs = Date.now();
      const lagMs = nowMs - tsMs;

      const key = `${data.last}|${data.bid}|${data.ask}|${data.timestamp}`;
      const changed = key !== lastSeen;
      lastSeen = key;

      console.log(
        JSON.stringify({
          now: new Date(nowMs).toISOString(),
          pair,
          last: Number(data.last),
          bid: Number(data.bid),
          ask: Number(data.ask),
          tickerTimestamp: new Date(tsMs).toISOString(),
          lagMs,
          changed,
        })
      );

      if (lagMs > 30_000) {
        console.warn(`[WARN] ticker lag is high (${lagMs}ms).`);
      }
    } catch (err: any) {
      console.error(`[ERROR] ${err?.message || err}`);
    }

    await sleep(intervalMs);
  }
})();


export {};
