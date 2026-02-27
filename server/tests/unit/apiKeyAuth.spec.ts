import { vi, describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { apiKeyAuth, requireScopes } from '../../src/middleware/apiKeyAuth';

const chain = vi.hoisted(() => {
  const c: any = {
    select: vi.fn(function (this: any) { return this; }),
    eq: vi.fn(function (this: any) { return this; }),
    maybeSingle: vi.fn(),
  };
  return c;
});

const mockSupabase = vi.hoisted(() => ({
  from: vi.fn(() => chain),
}));

vi.mock('../../src/config/supabase', () => ({
  supabase: mockSupabase,
}));

vi.mock('../../src/config/config', () => ({
  config: {
    developerApi: {
      apiKeyPepper: 'test-pepper',
    },
  },
}));

describe('apiKeyAuth', () => {
  let req: any;
  let res: any;
  let next: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    req = { header: vi.fn(), apiKey: undefined };
    res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    next = vi.fn();
  });

  it('returns 401 when Authorization header is missing', async () => {
    req.header.mockReturnValue(undefined);

    await apiKeyAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when key is not found in DB', async () => {
    req.header.mockReturnValue('Bearer p3_live_abcdef1234567890xy');
    chain.maybeSingle.mockResolvedValue({ data: null, error: null });

    await apiKeyAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches apiKey and calls next when key is valid', async () => {
    const rawKey = 'p3_live_' + 'a'.repeat(32);
    const pepper = 'test-pepper';
    const keyHash = crypto.createHash('sha256').update(rawKey + pepper).digest('hex');
    const prefix = rawKey.slice(0, 20);
    req.header.mockReturnValue(`Bearer ${rawKey}`);
    chain.maybeSingle.mockResolvedValue({
      data: {
        id: 'key-uuid',
        org_id: 'org-uuid',
        key_prefix: prefix,
        key_hash: keyHash,
        scopes: ['score:read'],
        status: 'active',
        rpm_limit: 60,
        rpd_limit: 10000,
      },
      error: null,
    });

    await apiKeyAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.apiKey).toEqual(expect.objectContaining({
      id: 'key-uuid',
      orgId: 'org-uuid',
      keyPrefix: prefix,
      scopes: ['score:read'],
      env: 'live',
      plan: 'sandbox',
      planStatus: 'active',
      rpmLimit: 60,
      rpdLimit: 10000,
      monthlyLimit: 5000,
    }));
  });
});

describe('requireScopes', () => {
  it('returns 403 when req.apiKey is missing', () => {
    const req: any = { apiKey: undefined };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    const next = vi.fn();
    requireScopes('score:read')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when required scope is not in apiKey.scopes', () => {
    const req: any = { apiKey: { scopes: ['score:history'] } };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    const next = vi.fn();
    requireScopes('score:read')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when required scope is present', () => {
    const req: any = { apiKey: { scopes: ['score:read', 'score:history'] } };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    const next = vi.fn();
    requireScopes('score:read')(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls next when any of multiple allowed scopes is present', () => {
    const req: any = { apiKey: { scopes: ['score:history'] } };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    const next = vi.fn();
    requireScopes('score:read', 'score:history')(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
