import request from 'supertest';
import app from '../../src/index';
import { WaitlistInviteService } from '../../src/services/waitlistInviteService';

describe('Waitlist routes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requires auth for Netlify waitlist sync', async () => {
    const response = await request(app)
      .post('/api/waitlist/sync-netlify')
      .send({ adminEmail: 'admin@p3lending.space' });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it('returns sync summary for authenticated admins', async () => {
    vi.spyOn(WaitlistInviteService, 'syncFromNetlify').mockResolvedValueOnce({
      source: 'netlify_forms',
      siteId: 'site_123',
      formId: 'form_abc',
      formName: 'waitlist',
      scanned: 12,
      inserted: 4,
      skipped: 8,
      syncedAt: '2026-02-17T12:00:00.000Z',
    });

    const response = await request(app)
      .post('/api/waitlist/sync-netlify')
      .set('x-test-user-id', '550e8400-e29b-41d4-a716-446655440000')
      .send({
        adminEmail: 'admin@p3lending.space',
        adminName: 'System Root',
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.inserted).toBe(4);
    expect(WaitlistInviteService.syncFromNetlify).toHaveBeenCalledWith(
      'admin@p3lending.space',
      'System Root'
    );
  });
});
