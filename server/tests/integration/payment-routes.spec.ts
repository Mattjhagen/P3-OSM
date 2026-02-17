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

  it('returns service catalog for custom Stripe services', async () => {
    const response = await request(app).get('/api/payments/services/catalog');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data?.services)).toBe(true);
    expect(response.body.data?.services?.length).toBeGreaterThan(0);
  });

  it('validates tax quote payload for custom Stripe services', async () => {
    const response = await request(app)
      .post('/api/payments/services/tax-quote')
      .send({ serviceType: 'risk_assessment', amountUsd: 20 });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(String(response.body.error || '')).toContain('customerAddress');
  });

  it('returns service unavailable for Stripe service checkout when Stripe is not configured', async () => {
    const response = await request(app)
      .post('/api/payments/services/create-checkout-session')
      .send({ serviceType: 'risk_assessment', amountUsd: 20 });

    expect(response.status).toBe(503);
    expect(response.body.success).toBe(false);
    expect(String(response.body.error || '')).toContain('Stripe is not configured');
  });
});
