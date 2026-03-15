/**
 * First-party telemetry client. Tracks events only when analytics consent is granted.
 * Uses localStorage for anonymous_id and session_id (no raw browser cookies).
 */

import { ConsentService } from './consentService';

const ANON_ID_KEY = 'p3_telemetry_anon_id';
const SESSION_ID_KEY = 'p3_telemetry_session_id';
const SESSION_START_KEY = 'p3_telemetry_session_start';

const ALLOWED_PROP_KEYS = new Set([
  'event_name',
  'page',
  'section',
  'referral_code',
  'waitlist_token',
  'element',
  'category',
  'value',
  'count',
  'duration_ms',
  'error_code',
]);

function getOrCreateId(key: string, prefix: string): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = window.localStorage.getItem(key);
    if (!id || !id.trim()) {
      id = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
      window.localStorage.setItem(key, id);
    }
    return id.trim();
  } catch {
    return '';
  }
}

function getAnonymousId(): string {
  return getOrCreateId(ANON_ID_KEY, 'anon');
}

function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  try {
    const startRaw = window.sessionStorage.getItem(SESSION_START_KEY);
    const now = Date.now();
    const sessionTtlMs = 30 * 60 * 1000; // 30 min
    const start = startRaw ? parseInt(startRaw, 10) : 0;
    if (!startRaw || now - start > sessionTtlMs) {
      const newSessionId = `sess_${now}_${Math.random().toString(36).slice(2, 10)}`;
      window.sessionStorage.setItem(SESSION_ID_KEY, newSessionId);
      window.sessionStorage.setItem(SESSION_START_KEY, String(now));
      return newSessionId;
    }
    let sid = window.sessionStorage.getItem(SESSION_ID_KEY);
    if (!sid) {
      sid = `sess_${now}_${Math.random().toString(36).slice(2, 10)}`;
      window.sessionStorage.setItem(SESSION_ID_KEY, sid);
      window.sessionStorage.setItem(SESSION_START_KEY, String(now));
    }
    return sid || '';
  } catch {
    return '';
  }
}

function stripProperties(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (ALLOWED_PROP_KEYS.has(k) && v !== undefined && v !== null) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        out[k] = v;
      } else if (typeof v === 'object' && !Array.isArray(v)) {
        // allow shallow object for nested category etc.
        out[k] = stripProperties(v as Record<string, unknown>);
      }
    }
  }
  return out;
}

let ingestUrl = '';

function getIngestUrl(): string {
  if (ingestUrl) return ingestUrl;
  if (typeof window === 'undefined') return '';
  const base = (window as any).__P3_API_BASE__ || import.meta.env?.VITE_API_BASE_URL || import.meta.env?.VITE_BACKEND_URL || '';
  ingestUrl = `${base.replace(/\/+$/, '')}/api/events`;
  return ingestUrl;
}

/**
 * Track an event. No-op when analytics consent is not granted.
 * Sends anonymous_id and session_id from first-party storage only.
 */
export function trackEvent(eventName: string, properties: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;
  const consent = ConsentService.get();
  if (!consent.analytics) return;

  const anonymousId = getAnonymousId();
  const sessionId = getSessionId();
  const safeProps = stripProperties(properties);
  const payload = {
    event_name: eventName,
    anonymous_id: anonymousId,
    session_id: sessionId,
    properties: safeProps,
    policy_version: consent.policyVersion,
    ts: new Date().toISOString(),
  };

  const url = getIngestUrl();
  if (!url) return;

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // fire-and-forget
  });
}

export const TelemetryClient = {
  trackEvent,
  getAnonymousId: (): string => (typeof window === 'undefined' ? '' : getAnonymousId()),
  getSessionId: (): string => getSessionId(),
};
