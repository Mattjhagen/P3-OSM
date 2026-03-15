/**
 * First-party consent: analytics and personalization.
 * Stored only in localStorage (no cookies). Policy version stored with consent.
 */

import type { ConsentState } from '../types';

const CONSENT_KEY = 'p3_consent';
const DEFAULT_POLICY_VERSION = '1.0';

const defaultState: ConsentState = {
  analytics: false,
  personalization: false,
  policyVersion: DEFAULT_POLICY_VERSION,
  updatedAt: new Date(0).toISOString(),
};

function load(): ConsentState {
  if (typeof window === 'undefined') return defaultState;
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw) as Partial<ConsentState>;
    return {
      analytics: Boolean(parsed.analytics),
      personalization: Boolean(parsed.personalization),
      policyVersion: String(parsed.policyVersion || DEFAULT_POLICY_VERSION),
      updatedAt: String(parsed.updatedAt || defaultState.updatedAt),
    };
  } catch {
    return defaultState;
  }
}

function save(state: ConsentState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export const ConsentService = {
  get(): ConsentState {
    return load();
  },

  set(partial: Partial<Pick<ConsentState, 'analytics' | 'personalization'>>, policyVersion = DEFAULT_POLICY_VERSION): ConsentState {
    const current = load();
    const next: ConsentState = {
      ...current,
      ...partial,
      policyVersion,
      updatedAt: new Date().toISOString(),
    };
    save(next);
    return next;
  },

  setAnalytics(value: boolean, policyVersion = DEFAULT_POLICY_VERSION): ConsentState {
    return ConsentService.set({ analytics: value }, policyVersion);
  },

  setPersonalization(value: boolean, policyVersion = DEFAULT_POLICY_VERSION): ConsentState {
    return ConsentService.set({ personalization: value }, policyVersion);
  },

  acceptAll(policyVersion = DEFAULT_POLICY_VERSION): ConsentState {
    return ConsentService.set({ analytics: true, personalization: true }, policyVersion);
  },

  rejectAll(policyVersion = DEFAULT_POLICY_VERSION): ConsentState {
    return ConsentService.set({ analytics: false, personalization: false }, policyVersion);
  },

  hasDecided(): boolean {
    const s = load();
    return s.updatedAt !== defaultState.updatedAt;
  },
};
