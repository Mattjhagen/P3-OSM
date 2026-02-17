import request from 'supertest';
import app from '../../src/index';
import { AdminNotificationService } from '../../src/services/adminNotificationService';

describe('Notification routes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requires authentication for admin notifications', async () => {
    const response = await request(app).post('/api/notifications/admin').send({
      category: 'chat_request',
      subject: 'Need support',
      message: 'Customer requested support',
    });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it('creates notification ticket for authenticated requests', async () => {
    vi.spyOn(AdminNotificationService, 'notify').mockResolvedValueOnce({
      ticketId: 'tick_123',
    });

    const response = await request(app)
      .post('/api/notifications/admin')
      .set('x-test-user-id', 'user-1')
      .set('x-test-user-roles', 'authenticated')
      .send({
        category: 'chat_request',
        subject: 'Need support',
        message: 'Customer opened a support thread.',
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.ticketId).toBe('tick_123');
    expect(AdminNotificationService.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'chat_request',
        userId: 'user-1',
      })
    );
  });
});

