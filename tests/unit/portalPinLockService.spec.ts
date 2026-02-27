import { describe, expect, it } from 'vitest';
import {
  hashPortalPin,
  normalizePortalPinInput,
  normalizePortalPinLockSettings,
  normalizePortalPinTimeout,
  validatePortalPin,
  verifyPortalPin,
} from '../../services/portalPinLock';

describe('portalPinLock service', () => {
  it('normalizes pin input to 4-6 digits', () => {
    expect(normalizePortalPinInput('12ab34')).toBe('1234');
    expect(normalizePortalPinInput('1234567890')).toBe('123456');
  });

  it('validates pin length and digits', () => {
    expect(validatePortalPin('123')).toMatch(/4 to 6 digits/i);
    expect(validatePortalPin('1234')).toBeNull();
    expect(validatePortalPin('123456')).toBeNull();
  });

  it('normalizes timeout options with safe default', () => {
    expect(normalizePortalPinTimeout(5)).toBe(5);
    expect(normalizePortalPinTimeout('15')).toBe(15);
    expect(normalizePortalPinTimeout(7)).toBe(10);
  });

  it('disables lock when settings are missing pin hash', () => {
    const normalized = normalizePortalPinLockSettings({
      enabled: true,
      inactivityMinutes: 15,
      pinHash: '',
      pinLength: 4,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(normalized.enabled).toBe(false);
    expect(normalized.inactivityMinutes).toBe(15);
  });

  it('hashes and verifies portal pins', async () => {
    const pinHash = await hashPortalPin('1234', 'user-1');
    await expect(verifyPortalPin('1234', 'user-1', pinHash)).resolves.toBe(true);
    await expect(verifyPortalPin('9999', 'user-1', pinHash)).resolves.toBe(false);
    await expect(verifyPortalPin('1234', 'user-2', pinHash)).resolves.toBe(false);
  });
});
