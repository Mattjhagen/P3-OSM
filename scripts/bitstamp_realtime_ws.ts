/**
 * Bitstamp WebSocket v2 real-time monitor
 *
 * Run:
 *   npx tsx scripts/bitstamp_realtime_ws.ts btcusd
 */

const pair = (process.argv[2] || 'btcusd').toLowerCase();
const WS_URL =
  process.env.BITSTAMP_WS_URL ||
  ((process.env.BITSTAMP_ENV || 'prod').toLowerCase() === 'sandbox'
    ? 'wss://ws.sandbox.bitstamp.net'
    : 'wss://ws.bitstamp.net');

const channel = `live_trades_${pair}`;

const ws = new WebSocket(WS_URL);

ws.addEventListener('open', () => {
  console.log(`[bitstamp-ws] connected ${WS_URL}`);
  ws.send(
    JSON.stringify({
      event: 'bts:subscribe',
      data: { channel },
    })
  );
  console.log(`[bitstamp-ws] subscribing to ${channel}`);
});

ws.addEventListener('message', (event) => {
  try {
    const msg = JSON.parse(String((event as MessageEvent).data));

    if (msg.event === 'bts:subscription_succeeded') {
      console.log(`[bitstamp-ws] subscribed ok: ${msg.channel}`);
      return;
    }

    if (msg.event === 'trade' && msg.channel === channel) {
      const data = msg.data || {};
      const now = Date.now();

      const tsMs = data.microtimestamp
        ? Number(data.microtimestamp) / 1000
        : data.timestamp
          ? Number(data.timestamp) * 1000
          : undefined;

      const lagMs = tsMs ? now - tsMs : undefined;

      console.log(
        JSON.stringify({
          now: new Date(now).toISOString(),
          pair,
          price: data.price ? Number(data.price) : undefined,
          amount: data.amount ? Number(data.amount) : undefined,
          side: data.type !== undefined ? (String(data.type) === '0' ? 'buy' : 'sell') : undefined,
          eventTs: tsMs ? new Date(tsMs).toISOString() : undefined,
          lagMs,
        })
      );
    }
  } catch (error) {
    console.error('[bitstamp-ws] bad message', error);
  }
});

ws.addEventListener('close', (event) => {
  console.log(`[bitstamp-ws] closed code=${event.code} reason=${event.reason}`);
});

ws.addEventListener('error', (event) => {
  console.error('[bitstamp-ws] error', event);
});


export {};
