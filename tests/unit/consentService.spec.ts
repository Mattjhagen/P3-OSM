import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConsentService } from '../../services/consentService';

const STORAGE_KEY = 'p3_consent';

describe('ConsentService', () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage[key] ?? null,
        setItem: (key: string, value: string) => {
          storage[key] = value;
        },
        removeItem: (key: string) => {
          delete storage[key];
        },
        clear: () => {
          Object.keys(storage).forEach((k) => delete storage[k]);
        },
        length: 0,
        key: () => null,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns default state when nothing stored', () => {
    const state = ConsentService.get();
    expect(state.analytics).toBe(false);
    expect(state.personalization).toBe(false);
    expect(state.policyVersion).toBe('1.0');
  });

  it('acceptAll sets analytics and personalization true', () => {
    const next = ConsentService.acceptAll('1.0');
    expect(next.analytics).toBe(true);
    expect(next.personalization).toBe(true);
    expect(storage[STORAGE_KEY]).toBeDefined();
    const parsed = JSON.parse(storage[STORAGE_KEY]);
    expect(parsed.analytics).toBe(true);
    expect(parsed.personalization).toBe(true);
  });

  it('rejectAll sets both false', () => {
    ConsentService.acceptAll('1.0');
    const next = ConsentService.rejectAll('1.0');
    expect(next.analytics).toBe(false);
    expect(next.personalization).toBe(false);
  });

  it('hasDecided returns false when never set', () => {
    expect(ConsentService.hasDecided()).toBe(false);
  });

  it('hasDecided returns true after set', () => {
    ConsentService.set({ analytics: true });
    expect(ConsentService.hasDecided()).toBe(true);
  });
});
