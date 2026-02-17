import request from 'supertest';
import app from '../../src/index';
import { MarketPriceService } from '../../src/services/marketPriceService';
import { TradingService } from '../../src/services/tradingService';
import { WithdrawalService } from '../../src/services/withdrawalService';

describe('Trading + withdrawal routes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('serves CoinGecko-backed price response envelope', async () => {
    vi.spyOn(MarketPriceService, 'getQuotes').mockResolvedValueOnce({
      BTC: {
        symbol: 'BTC',
        coinId: 'bitcoin',
        usd: 100000,
        usd24hChange: 1.5,
        usdMarketCap: 2000000000000,
        fetchedAt: '2026-02-17T00:00:00.000Z',
      },
    });

    const response = await request(app).get('/api/prices?symbols=BTC');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.quotes.BTC.usd).toBe(100000);
  });

  it('returns 402 for insufficient funds trade declines', async () => {
    const error = new Error('Insufficient available balance.') as Error & { status?: number };
    error.status = 402;

    vi.spyOn(TradingService, 'executeOrder').mockRejectedValueOnce(error);

    const response = await request(app)
      .post('/api/trading/orders/execute')
      .send({ userId: 'user-1', symbol: 'BTC', side: 'BUY', amountUsd: 500 });

    expect(response.status).toBe(402);
    expect(response.body.success).toBe(false);
  });

  it('returns 503 when withdrawal provider is not configured', async () => {
    vi.spyOn(WithdrawalService, 'requestWithdrawal').mockRejectedValueOnce(
      new Error('BTC provider is not configured.')
    );

    const response = await request(app)
      .post('/api/withdrawals')
      .send({
        userId: 'user-1',
        method: 'BTC',
        amountUsd: 100,
        destination: 'bc1qabc123abc123abc123abc123abc123abc123abc123',
      });

    expect(response.status).toBe(503);
    expect(response.body.success).toBe(false);
  });
});
