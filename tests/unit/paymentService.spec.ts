import { PaymentService } from '../../services/paymentService';

describe('PaymentService.createDonationCheckoutSession', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    (globalThis as any).fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns checkout URL when backend responds with success payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_123',
          sessionId: 'cs_test_123',
        },
      }),
    });
    (globalThis as any).fetch = fetchMock;

    const result = await PaymentService.createDonationCheckoutSession({
      amountUsd: 25,
      source: 'unit_test',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/payments/donations/create-checkout-session'),
      expect.objectContaining({
        method: 'POST',
      })
    );
    expect(result.checkoutUrl).toBe('https://checkout.stripe.com/c/pay/cs_test_123');
    expect(result.sessionId).toBe('cs_test_123');
  });

  it('throws backend-provided error when checkout session creation fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        success: false,
        error: 'Stripe is not configured on the server.',
      }),
    });
    (globalThis as any).fetch = fetchMock;

    await expect(
      PaymentService.createDonationCheckoutSession({
        amountUsd: 25,
      })
    ).rejects.toThrow('Stripe is not configured on the server.');
  });
});

describe('PaymentService.createDepositCheckoutSession', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    (globalThis as any).fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns checkout URL when backend responds with success payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_deposit',
          sessionId: 'cs_test_deposit',
        },
      }),
    });
    (globalThis as any).fetch = fetchMock;

    const result = await PaymentService.createDepositCheckoutSession({
      amountUsd: 10,
      userId: 'user_123',
      userEmail: 'matt@example.com',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/payments/deposit/create'),
      expect.objectContaining({
        method: 'POST',
      })
    );
    expect(result.checkoutUrl).toContain('checkout.stripe.com');
  });

  it('throws explicit backend unavailable message when network fetch fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    (globalThis as any).fetch = fetchMock;

    await expect(
      PaymentService.createDepositCheckoutSession({
        amountUsd: 15,
        userId: 'user_123',
      })
    ).rejects.toThrow('Payments backend is unavailable right now');
  });
});
