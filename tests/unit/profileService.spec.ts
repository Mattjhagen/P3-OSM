import { describe, expect, it, vi, beforeEach } from 'vitest';

const loadUserMock = vi.fn();

vi.mock('../../services/persistence', () => ({
  PersistenceService: {
    loadUser: (...args: unknown[]) => loadUserMock(...args),
  },
}));

import { ensureProfile, isProfileAccessDeniedError } from '../../services/profile';

describe('ensureProfile', () => {
  const mockAuthUser = {
    id: 'user-123',
    email: 'test@example.com',
    user_metadata: { full_name: 'Test User' },
  };

  const mockProfile = {
    id: 'user-123',
    name: 'Test User',
    email: 'test@example.com',
    income: 0,
    balance: 0,
    employmentStatus: 'Unemployed',
    financialHistory: 'New account.',
    reputationScore: 50,
    riskAnalysis: 'Insufficient data.',
    successfulRepayments: 0,
    currentStreak: 0,
    badges: [],
    kycTier: 0,
    kycStatus: 'UNVERIFIED',
    kycLimit: 0,
    mentorshipsCount: 0,
    walletAgeDays: 0,
    txCount: 0,
    referrals: [],
  };

  beforeEach(() => {
    loadUserMock.mockReset();
  });

  it('returns profile when loadUser resolves with a profile', async () => {
    loadUserMock.mockResolvedValueOnce(mockProfile);
    const result = await ensureProfile(mockAuthUser, null);
    expect(result.error).toBeNull();
    expect(result.profile).toEqual(mockProfile);
    expect(loadUserMock).toHaveBeenCalledWith(mockAuthUser, null);
  });

  it('returns error when loadUser throws', async () => {
    loadUserMock.mockRejectedValueOnce(new Error('RLS policy violation'));
    const result = await ensureProfile(mockAuthUser);
    expect(result.profile).toBeNull();
    expect(result.error).toBe('RLS policy violation');
  });

  it('returns error when auth user is null', async () => {
    const result = await ensureProfile(null);
    expect(result.profile).toBeNull();
    expect(result.error).toBe('Not signed in');
    expect(result.status).toBe(401);
    expect(loadUserMock).not.toHaveBeenCalled();
  });

  it('resolves with error on failure and does not hang', async () => {
    loadUserMock.mockRejectedValueOnce(new Error('Network error'));
    const start = Date.now();
    const result = await ensureProfile(mockAuthUser);
    const elapsed = Date.now() - start;
    expect(result.profile).toBeNull();
    expect(result.error).toBe('Network error');
    expect(elapsed).toBeLessThan(5000);
  });
});

describe('isProfileAccessDeniedError', () => {
  it('returns true for 401/403 status or code', () => {
    expect(isProfileAccessDeniedError({ profile: null, error: 'x', status: 401 })).toBe(true);
    expect(isProfileAccessDeniedError({ profile: null, error: 'x', status: 403 })).toBe(true);
    expect(isProfileAccessDeniedError({ profile: null, error: 'x', code: '401' })).toBe(true);
    expect(isProfileAccessDeniedError({ profile: null, error: 'x', code: '403' })).toBe(true);
  });

  it('returns true when error message mentions denied or permission', () => {
    expect(isProfileAccessDeniedError({ profile: null, error: 'Access denied' })).toBe(true);
    expect(isProfileAccessDeniedError({ profile: null, error: 'Permission denied' })).toBe(true);
    expect(isProfileAccessDeniedError({ profile: null, error: 'RLS policy' })).toBe(true);
  });

  it('returns false for other errors', () => {
    expect(isProfileAccessDeniedError({ profile: null, error: 'Network error' })).toBe(false);
    expect(isProfileAccessDeniedError({ profile: null, error: 'Profile load timed out' })).toBe(false);
  });
});
