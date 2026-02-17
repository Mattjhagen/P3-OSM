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
