import request from 'supertest';
import app from '../../src/index';
import {
  WaitlistAdminError,
  WaitlistAdminService,
} from '../../src/services/waitlistAdminService';

describe('Admin waitlist routes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns waitlist rows from admin endpoint', async () => {
    const getWaitlistQueueSpy = vi
      .spyOn(WaitlistAdminService, 'getWaitlistQueue')
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'wait_1',
            name: 'Alice',
            email: 'alice@example.com',
            status: 'PENDING',
            invite_status: 'pending',
            created_at: '2026-02-18T00:00:00.000Z',
            invited_at: null,
            onboarded_at: null,
            invite_batch_id: null,
            referral_code: null,
            referred_by: null,
            referral_count: 0,
            waitlist_score: 0,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 100,
      });

    const response = await request(app).get('/api/admin/waitlist').query({
      adminEmail: 'admin@p3lending.space',
      page: 1,
      pageSize: 100,
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].email).toBe('alice@example.com');
    expect(response.body.meta.total).toBe(1);
    expect(getWaitlistQueueSpy).toHaveBeenCalledWith({
      adminEmail: 'admin@p3lending.space',
      authorizationHeader: '',
      page: 1,
      pageSize: 100,
    });
  });

  it('returns explicit auth error when admin validation fails', async () => {
    vi.spyOn(WaitlistAdminService, 'syncWaitlist').mockRejectedValueOnce(
      new WaitlistAdminError(403, 'Admin user does not have waitlist management permissions.')
    );

    const response = await request(app).post('/api/admin/waitlist/sync').send({
      adminEmail: 'viewer@p3lending.space',
      adminName: 'Viewer',
    });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(String(response.body.error || '')).toContain('permissions');
  });

  it('invites next batch through admin waitlist endpoint', async () => {
    vi.spyOn(WaitlistAdminService, 'inviteNextWaitlist').mockResolvedValueOnce({
      requested: 10,
      updated: 2,
      queued: 2,
      skipped: 8,
      rows: [
        {
          id: 'wait_1',
          name: 'Alice',
          email: 'alice@example.com',
          status: 'INVITED',
          invite_status: 'invited',
          created_at: '2026-02-18T00:00:00.000Z',
          invited_at: '2026-02-18T00:05:00.000Z',
          onboarded_at: null,
          invite_batch_id: 'batch_1',
          referral_code: null,
          referred_by: null,
          referral_count: 0,
          waitlist_score: 0,
        },
        {
          id: 'wait_2',
          name: 'Bob',
          email: 'bob@example.com',
          status: 'INVITED',
          invite_status: 'invited',
          created_at: '2026-02-18T00:00:01.000Z',
          invited_at: '2026-02-18T00:05:00.000Z',
          onboarded_at: null,
          invite_batch_id: 'batch_1',
          referral_code: null,
          referred_by: null,
          referral_count: 0,
          waitlist_score: 0,
        },
      ],
    });

    const response = await request(app).post('/api/admin/waitlist/invite-next').send({
      adminEmail: 'admin@p3lending.space',
      adminName: 'Admin',
      batchSize: 10,
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.updated).toBe(2);
    expect(response.body.data.rows).toHaveLength(2);
  });
});
