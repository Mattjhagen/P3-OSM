import request from 'supertest';
import app from '../../src/index';
import { ComplianceService } from '../../src/services/complianceService';

describe('Compliance routes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns feature status envelope', async () => {
    vi.spyOn(ComplianceService, 'getFeatureStatus').mockResolvedValueOnce({
      userId: 'user-1',
      featureKey: 'ADD_FUNDS',
      tosVersion: 'add-funds-v1-2026-02-17',
      status: 'approved',
      approved: true,
      requiresReacceptance: false,
      acceptedAt: '2026-02-17T00:00:00.000Z',
      lastRiskEvaluatedAt: '2026-02-17T00:00:00.000Z',
      riskTier: 0,
      riskScore: 80,
      riskReasons: [],
      manualReviewTicketId: null,
      title: 'Add Funds Terms & Risk Application',
      summary: 'summary',
    });

    const response = await request(app)
      .get('/api/compliance/features/status')
      .set('x-test-user-id', 'user-1')
      .query({ userId: 'user-1', feature: 'ADD_FUNDS' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.approved).toBe(true);
  });

  it('returns downloadable statement json', async () => {
    vi.spyOn(ComplianceService, 'getStatementDownload').mockResolvedValueOnce({
      id: 'st-1',
      userId: 'user-1',
      statementType: 'MONTHLY',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      generatedAt: '2026-02-01T00:00:00.000Z',
      openingBalanceUsd: 100,
      closingBalanceUsd: 120,
      currency: 'USD',
      totals: { transactionCount: 2 },
      entries: [],
      signatureHash: 'abc123',
      signatureAlgorithm: 'hmac-sha256:v1',
      source: 'scheduler',
      metadata: {},
    });

    const response = await request(app)
      .get('/api/compliance/statements/st-1/download')
      .set('x-test-user-id', 'user-1')
      .query({ userId: 'user-1' });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.headers['content-disposition']).toContain('attachment;');
  });
});
