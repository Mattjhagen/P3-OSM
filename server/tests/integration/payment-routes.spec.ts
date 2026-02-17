import request from 'supertest';
import app from '../../src/index';

describe('Payment routes (donations)', () => {
  it('validates donation amount before creating checkout session', async () => {
    const response = await request(app)
      .post('/api/payments/donations/create-checkout-session')
      .send({ amountUsd: 0 });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('amountUsd');
  });

  it('returns service unavailable when Stripe is not configured', async () => {
    const response = await request(app)
      .post('/api/payments/donations/create-checkout-session')
      .send({ amountUsd: 25, donorEmail: 'donor@example.com' });

    expect(response.status).toBe(503);
    expect(response.body.success).toBe(false);
    expect(String(response.body.error || '')).toContain('Stripe is not configured');
  });

  it('returns service unavailable for webhooks when Stripe webhook secret is missing', async () => {
    const response = await request(app)
      .post('/api/payments/webhook')
      .set('stripe-signature', 't=0,v1=test')
      .send('{}');

    expect(response.status).toBe(503);
    expect(response.body.received).toBe(false);
  });
});
