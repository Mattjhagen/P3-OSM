import request from 'supertest';
import app from '../../src/index';
import * as eventsIngestService from '../../src/services/eventsIngestService';

describe('Events routes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 400 when event_name is missing', async () => {
    const response = await request(app)
      .post('/api/events')
      .send({
        anonymous_id: 'anon_123',
        session_id: 'sess_456',
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(String(response.body.error || '')).toContain('event_name');
  });

  it('returns 400 when anonymous_id is missing', async () => {
    const response = await request(app)
      .post('/api/events')
      .send({
        event_name: 'page_view',
        session_id: 'sess_456',
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(String(response.body.error || '')).toContain('anonymous_id');
  });

  it('returns 201 when valid payload is accepted', async () => {
    vi.spyOn(eventsIngestService, 'ingestEvent').mockResolvedValueOnce({ ok: true, id: 'evt_uuid_1' });

    const response = await request(app)
      .post('/api/events')
      .send({
        event_name: 'page_view',
        anonymous_id: 'anon_123',
        session_id: 'sess_456',
        properties: { page: '/', category: 'landing' },
        policy_version: '1.0',
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.id).toBe('evt_uuid_1');
    expect(eventsIngestService.ingestEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: 'page_view',
        anonymous_id: 'anon_123',
        session_id: 'sess_456',
      })
    );
  });
});
