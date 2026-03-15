import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { trackEvent, TelemetryClient } from '../../services/telemetryClient';
import * as consentService from '../../services/consentService';

describe('TelemetryClient', () => {
  let fetchCalls: Array<{ url: string; options: RequestInit }> = [];

  beforeEach(() => {
    fetchCalls = [];
    vi.stubGlobal('fetch', (url: string, options?: RequestInit) => {
      fetchCalls.push({ url, options: options || {} });
      return Promise.resolve({ ok: true } as Response);
    });
    vi.stubGlobal('window', {
      localStorage: {
        getItem: vi.fn((key: string) => (key === 'p3_telemetry_anon_id' ? null : null)),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        length: 0,
        key: vi.fn(() => null),
      },
      sessionStorage: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        length: 0,
        key: vi.fn(() => null),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not call fetch when analytics consent is false', () => {
    vi.spyOn(consentService.ConsentService, 'get').mockReturnValue({
      analytics: false,
      personalization: false,
      policyVersion: '1.0',
      updatedAt: new Date().toISOString(),
    });
    trackEvent('page_view', { page: '/' });
    expect(fetchCalls.length).toBe(0);
  });

  it('calls fetch when analytics consent is true', () => {
    vi.spyOn(consentService.ConsentService, 'get').mockReturnValue({
      analytics: true,
      personalization: false,
      policyVersion: '1.0',
      updatedAt: new Date().toISOString(),
    });
    const setItem = vi.fn();
    const getItem = vi.fn((key: string) => {
      if (key === 'p3_telemetry_anon_id') return 'anon_123';
      return null;
    });
    (window as any).localStorage = { getItem, setItem, removeItem: vi.fn(), clear: vi.fn(), length: 0, key: vi.fn() };
    (window as any).sessionStorage = {
      getItem: vi.fn((k: string) => (k === 'p3_telemetry_session_id' ? 'sess_456' : null)),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    };
    trackEvent('page_view', { page: '/' });
    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0].url).toContain('/api/events');
    const body = JSON.parse((fetchCalls[0].options.body as string) || '{}');
    expect(body.event_name).toBe('page_view');
    expect(body.anonymous_id).toBeDefined();
    expect(body.session_id).toBeDefined();
    expect(body.properties).toBeDefined();
  });
});
