import request from 'supertest';
import app from '../../src/index';

describe('GET /health', () => {
  it('returns backend status and timestamp', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('active');
    expect(typeof response.body.timestamp).toBe('string');
  });
});

describe('GET /api/health', () => {
  it('returns API health payload expected by status page', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.service).toBe('render-backend');
    expect(response.body.status).toBe('active');
    expect(typeof response.body.timestamp).toBe('string');
  });
});
