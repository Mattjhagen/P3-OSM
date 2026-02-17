import { TradingService } from '../../services/tradingService';

describe('TradingService', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    (globalThis as any).fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns quotes from backend price endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          quotes: {
            BTC: {
              symbol: 'BTC',
              usd: 100000,
              usd24hChange: 1.2,
              usdMarketCap: 2000000000000,
              fetchedAt: '2026-02-17T00:00:00.000Z',
            },
          },
        },
      }),
    });

    (globalThis as any).fetch = fetchMock;

    const quotes = await TradingService.getPrices(['BTC']);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/prices?symbols=BTC'), expect.anything());
    expect(quotes.BTC.usd).toBe(100000);
  });

  it('throws backend unavailable message when order execute request cannot reach backend', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    (globalThis as any).fetch = fetchMock;

    await expect(
      TradingService.executeOrder({
        userId: 'user_1',
        symbol: 'BTC',
        side: 'BUY',
        amountUsd: 50,
      })
    ).rejects.toThrow('Trading backend is unavailable right now');
  });

  it('throws backend business error payload for withdrawals', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        success: false,
        error: 'BTC withdrawals are disabled.',
      }),
    });

    (globalThis as any).fetch = fetchMock;

    await expect(
      TradingService.requestWithdrawal({
        userId: 'user_1',
        method: 'BTC',
        amountUsd: 100,
        destination: 'bc1qtestaddress0000000000000000000000000',
      })
    ).rejects.toThrow('BTC withdrawals are disabled.');
  });
});
