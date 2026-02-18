const { fromMock, insertMock, rpcMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  insertMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock('../../src/config/supabase', () => ({
  supabase: {
    from: fromMock,
    rpc: rpcMock,
  },
}));

import { NotificationEventService } from '../../src/services/notificationEventService';

describe('NotificationEventService', () => {
  beforeEach(() => {
    fromMock.mockReset();
    insertMock.mockReset();
    rpcMock.mockReset();

    insertMock.mockResolvedValue({ error: null });
    fromMock.mockReturnValue({ insert: insertMock });
    rpcMock.mockResolvedValue({ error: null });
  });

  it('writes audit + outbox records for executed trades', async () => {
    await NotificationEventService.recordTradeExecuted({
      userId: '550e8400-e29b-41d4-a716-446655440000',
      email: 'trader@example.com',
      orderId: 'trade_123',
      ledgerId: 'ledger_123',
      symbol: 'BTC',
      side: 'BUY',
      amountUsd: 250,
      netAmountUsd: 240,
      feeUsd: 10,
      fiatCurrency: 'USD',
    });

    expect(fromMock).toHaveBeenCalledWith('audit_events');
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: '550e8400-e29b-41d4-a716-446655440000',
        event_type: 'SEC_TRADE_EXECUTED',
      })
    );

    expect(rpcMock).toHaveBeenCalledWith(
      'enqueue_notification',
      expect.objectContaining({
        p_user_id: '550e8400-e29b-41d4-a716-446655440000',
        p_to_email: 'trader@example.com',
        p_template_key: 'SEC_TRADE_EXECUTED',
        p_idempotency_key: 'SEC_TRADE_EXECUTED:trade_123',
      })
    );
  });

  it('skips enqueue when email is missing', async () => {
    await NotificationEventService.recordTradeExecuted({
      userId: '550e8400-e29b-41d4-a716-446655440000',
      email: '',
      orderId: 'trade_123',
      ledgerId: 'ledger_123',
      symbol: 'BTC',
      side: 'BUY',
      amountUsd: 250,
      netAmountUsd: 240,
      feeUsd: 10,
      fiatCurrency: 'USD',
    });

    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
