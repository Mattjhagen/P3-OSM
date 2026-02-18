import {
  computeBackoffMinutes,
  processOutboxBatch,
} from '../../netlify/functions/_shared/notification-core.js';

describe('notification outbox processor', () => {
  it('marks claimed rows as sent when SendGrid send succeeds', async () => {
    const markSent = vi.fn().mockResolvedValue(undefined);
    const markFailed = vi.fn().mockResolvedValue(undefined);
    const dbOps = {
      listPending: vi.fn().mockResolvedValue([
        { id: 'row-1', attempts: 0, template_key: 'SEC_TRADE_EXECUTED' },
      ]),
      claimPending: vi.fn().mockResolvedValue({
        id: 'row-1',
        attempts: 0,
        channel: 'email',
        template_key: 'SEC_TRADE_EXECUTED',
      }),
      markSent,
      markFailed,
    };

    const summary = await processOutboxBatch({
      dbOps: dbOps as any,
      sendEmail: vi.fn().mockResolvedValue({ accepted: true }),
      now: new Date('2026-02-18T12:00:00.000Z'),
    });

    expect(summary.sent).toBe(1);
    expect(summary.retried).toBe(0);
    expect(summary.failed).toBe(0);
    expect(markSent).toHaveBeenCalledTimes(1);
    expect(markFailed).not.toHaveBeenCalled();
  });

  it('requeues pending rows with backoff on transient failures', async () => {
    const markSent = vi.fn().mockResolvedValue(undefined);
    const markFailed = vi.fn().mockResolvedValue(undefined);
    const dbOps = {
      listPending: vi.fn().mockResolvedValue([
        { id: 'row-2', attempts: 1, template_key: 'SEC_TRADE_EXECUTED' },
      ]),
      claimPending: vi.fn().mockResolvedValue({
        id: 'row-2',
        attempts: 1,
        channel: 'email',
        template_key: 'SEC_TRADE_EXECUTED',
      }),
      markSent,
      markFailed,
    };

    const summary = await processOutboxBatch({
      dbOps: dbOps as any,
      sendEmail: vi.fn().mockRejectedValue(new Error('sendgrid timeout')),
      now: new Date('2026-02-18T12:00:00.000Z'),
    });

    expect(summary.sent).toBe(0);
    expect(summary.retried).toBe(1);
    expect(summary.failed).toBe(0);
    expect(markSent).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'row-2',
        attempts: 2,
        status: 'pending',
      })
    );
  });

  it('marks rows as failed after max retry attempts', async () => {
    const markFailed = vi.fn().mockResolvedValue(undefined);
    const dbOps = {
      listPending: vi.fn().mockResolvedValue([
        { id: 'row-3', attempts: 4, template_key: 'LOAN_PAYMENT_LATE' },
      ]),
      claimPending: vi.fn().mockResolvedValue({
        id: 'row-3',
        attempts: 4,
        channel: 'email',
        template_key: 'LOAN_PAYMENT_LATE',
      }),
      markSent: vi.fn().mockResolvedValue(undefined),
      markFailed,
    };

    const summary = await processOutboxBatch({
      dbOps: dbOps as any,
      sendEmail: vi.fn().mockRejectedValue(new Error('permanent failure')),
      now: new Date('2026-02-18T12:00:00.000Z'),
      maxAttempts: 5,
    });

    expect(summary.failed).toBe(1);
    expect(summary.retried).toBe(0);
    expect(markFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'row-3',
        attempts: 5,
        status: 'failed',
      })
    );
  });
});

describe('notification retry backoff', () => {
  it('uses progressive exponential-ish retry windows', () => {
    expect(computeBackoffMinutes(1)).toBe(1);
    expect(computeBackoffMinutes(2)).toBe(5);
    expect(computeBackoffMinutes(3)).toBe(15);
    expect(computeBackoffMinutes(4)).toBe(60);
    expect(computeBackoffMinutes(5)).toBe(360);
    expect(computeBackoffMinutes(99)).toBe(360);
  });
});
