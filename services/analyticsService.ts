import { supabase } from '../supabaseClient';
import { ClientLogService } from './clientLogService';

type SourceType =
  | 'direct'
  | 'referrer'
  | 'utm'
  | 'referral_code'
  | 'invite_link'
  | 'waitlist_invite';

interface AttributionContext {
  sourceType: SourceType;
  sourceValue: string;
  referralCode: string;
  inviteCode: string;
  waitlistToken: string;
}

interface SessionState {
  sessionId: string;
  firstSeen: string;
  sourceType: SourceType;
  sourceValue: string;
  referralCode: string;
  inviteCode: string;
  waitlistToken: string;
  landingPath: string;
  userAgent: string;
  country: string;
  region: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  userId: string;
  email: string;
}

const SESSION_ID_KEY = 'p3_live_session_id';
const ATTRIBUTION_KEY = 'p3_attribution_context_v1';
const HEARTBEAT_MS = 30_000;

let sessionState: SessionState | null = null;
let heartbeatTimer: number | null = null;
let started = false;
let liveSessionsTableAvailable = true;
let analyticsEventsTableAvailable = true;
const missingTableWarnings = new Set<string>();

const isMissingTableError = (message: string, tableName: string) => {
  const normalized = (message || '').toLowerCase();
  return (
    normalized.includes(`could not find the table 'public.${tableName}'`) ||
    normalized.includes(`relation "${tableName}" does not exist`) ||
    (normalized.includes(tableName.toLowerCase()) && normalized.includes('schema cache'))
  );
};

const markTableUnavailable = (tableName: 'live_sessions' | 'analytics_events', message: string) => {
  if (tableName === 'live_sessions') {
    liveSessionsTableAvailable = false;
  } else {
    analyticsEventsTableAvailable = false;
    ClientLogService.setRemoteSink(null);
  }

  const warningKey = `${tableName}:${message}`;
  if (missingTableWarnings.has(warningKey)) return;
  missingTableWarnings.add(warningKey);

  console.warn(
    `AnalyticsService disabled ${tableName} writes: ${message}. Apply Supabase migrations 20260217021000_live_sessions_and_analytics.sql and 20260217024500_analytics_events_user_indexes.sql.`
  );
};

const getNowIso = () => new Date().toISOString();

const getStorage = (): Storage | null => {
  if (typeof window === 'undefined') return null;
  if (!window.localStorage) return null;
  return window.localStorage;
};

const sanitize = (value: string | null | undefined) => (value || '').trim();

const syncClientLogContext = () => {
  if (!sessionState) return;
  ClientLogService.updateActorContext({
    sessionId: sessionState.sessionId,
    userId: sessionState.userId,
    email: sessionState.email,
  });
};

const createSessionId = () =>
  `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const getOrCreateSessionId = (): string => {
  const storage = getStorage();
  if (!storage) return createSessionId();

  const existing = sanitize(storage.getItem(SESSION_ID_KEY));
  if (existing) return existing;

  const next = createSessionId();
  storage.setItem(SESSION_ID_KEY, next);
  return next;
};

const parseAttribution = (query: URLSearchParams): AttributionContext => {
  const refCode = sanitize(query.get('ref') || query.get('referral') || query.get('referral_code'));
  const inviteCode = sanitize(query.get('invite') || query.get('invite_code'));
  const waitlistToken = sanitize(query.get('waitlist') || query.get('waitlist_invite'));
  const utmSource = sanitize(query.get('utm_source'));
  const referrer = sanitize(typeof document !== 'undefined' ? document.referrer : '');

  if (refCode) {
    return {
      sourceType: 'referral_code',
      sourceValue: refCode,
      referralCode: refCode,
      inviteCode,
      waitlistToken,
    };
  }

  if (inviteCode) {
    return {
      sourceType: 'invite_link',
      sourceValue: inviteCode,
      referralCode: refCode,
      inviteCode,
      waitlistToken,
    };
  }

  if (waitlistToken) {
    return {
      sourceType: 'waitlist_invite',
      sourceValue: waitlistToken,
      referralCode: refCode,
      inviteCode,
      waitlistToken,
    };
  }

  if (utmSource) {
    return {
      sourceType: 'utm',
      sourceValue: utmSource,
      referralCode: refCode,
      inviteCode,
      waitlistToken,
    };
  }

  if (referrer) {
    return {
      sourceType: 'referrer',
      sourceValue: referrer,
      referralCode: refCode,
      inviteCode,
      waitlistToken,
    };
  }

  return {
    sourceType: 'direct',
    sourceValue: 'direct',
    referralCode: refCode,
    inviteCode,
    waitlistToken,
  };
};

const saveAttributionContext = (context: AttributionContext) => {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(ATTRIBUTION_KEY, JSON.stringify(context));
};

const loadAttributionContext = (): AttributionContext | null => {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(ATTRIBUTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      sourceType: (parsed.sourceType as SourceType) || 'direct',
      sourceValue: sanitize(parsed.sourceValue),
      referralCode: sanitize(parsed.referralCode),
      inviteCode: sanitize(parsed.inviteCode),
      waitlistToken: sanitize(parsed.waitlistToken),
    };
  } catch {
    return null;
  }
};

const fetchGeoLocation = async (): Promise<{
  country: string;
  region: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
}> => {
  try {
    const response = await fetch('https://ipapi.co/json/', { method: 'GET' });
    if (!response.ok) throw new Error(`ipapi status ${response.status}`);
    const payload = await response.json();
    return {
      country: sanitize(payload.country_name) || sanitize(payload.country) || 'Unknown',
      region: sanitize(payload.region) || 'Unknown',
      city: sanitize(payload.city) || 'Unknown',
      latitude: typeof payload.latitude === 'number' ? payload.latitude : null,
      longitude: typeof payload.longitude === 'number' ? payload.longitude : null,
    };
  } catch {
    return {
      country: 'Unknown',
      region: 'Unknown',
      city: 'Unknown',
      latitude: null,
      longitude: null,
    };
  }
};

const upsertSession = async (patch: Partial<SessionState> = {}) => {
  if (!sessionState) return;
  if (!liveSessionsTableAvailable) return;

  const nextState = { ...sessionState, ...patch };
  sessionState = nextState;
  syncClientLogContext();

  const payload = {
    session_id: nextState.sessionId,
    user_id: nextState.userId || null,
    email: nextState.email || null,
    is_authenticated: Boolean(nextState.userId || nextState.email),
    is_active: true,
    first_seen: nextState.firstSeen,
    last_seen: getNowIso(),
    country: nextState.country || null,
    region: nextState.region || null,
    city: nextState.city || null,
    latitude: nextState.latitude,
    longitude: nextState.longitude,
    source_type: nextState.sourceType,
    source_value: nextState.sourceValue || null,
    referral_code: nextState.referralCode || null,
    invite_code: nextState.inviteCode || null,
    waitlist_token: nextState.waitlistToken || null,
    landing_path: nextState.landingPath,
    user_agent: nextState.userAgent,
  };

  await ClientLogService.withMutedCapture(async () => {
    const { error } = await supabase.from('live_sessions').upsert(payload, {
      onConflict: 'session_id',
      ignoreDuplicates: false,
    });
    if (error) {
      if (isMissingTableError(error.message, 'live_sessions')) {
        markTableUnavailable('live_sessions', error.message);
      } else {
        console.warn('AnalyticsService session upsert failed', error.message);
      }
    }
  });
};

const insertEvent = async (
  eventType: string,
  eventName: string,
  metadata: Record<string, unknown> = {}
) => {
  if (!sessionState) return;
  if (!analyticsEventsTableAvailable) return;

  await ClientLogService.withMutedCapture(async () => {
    const { error } = await supabase.from('analytics_events').insert({
      session_id: sessionState!.sessionId,
      user_id: sessionState!.userId || null,
      email: sessionState!.email || null,
      event_type: eventType,
      event_name: eventName,
      metadata,
      created_at: getNowIso(),
    });
    if (error) {
      if (isMissingTableError(error.message, 'analytics_events')) {
        markTableUnavailable('analytics_events', error.message);
      } else {
        console.warn('AnalyticsService event insert failed', error.message);
      }
    }
  });
};

const stopHeartbeat = () => {
  if (heartbeatTimer) {
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
};

const startHeartbeat = () => {
  stopHeartbeat();
  heartbeatTimer = window.setInterval(() => {
    upsertSession();
  }, HEARTBEAT_MS);
};

export const AnalyticsService = {
  startSessionTracking: async () => {
    if (typeof window === 'undefined') return;
    if (started) return;
    started = true;

    const query = new URLSearchParams(window.location.search);
    const parsedAttribution = parseAttribution(query);
    const persistedAttribution = loadAttributionContext();
    const attribution =
      parsedAttribution.sourceType !== 'direct' || parsedAttribution.sourceValue !== 'direct'
        ? parsedAttribution
        : persistedAttribution || parsedAttribution;

    saveAttributionContext(attribution);

    const geo = await fetchGeoLocation();
    sessionState = {
      sessionId: getOrCreateSessionId(),
      firstSeen: getNowIso(),
      sourceType: attribution.sourceType,
      sourceValue: attribution.sourceValue,
      referralCode: attribution.referralCode,
      inviteCode: attribution.inviteCode,
      waitlistToken: attribution.waitlistToken,
      landingPath: window.location.pathname,
      userAgent: navigator.userAgent,
      country: geo.country,
      region: geo.region,
      city: geo.city,
      latitude: geo.latitude,
      longitude: geo.longitude,
      userId: '',
      email: '',
    };
    syncClientLogContext();
    ClientLogService.setRemoteSink((entry) =>
      insertEvent('client_log', entry.level, {
        source: entry.source,
        message: entry.message,
        context: entry.context || '',
        level: entry.level,
        sessionId: entry.sessionId || sessionState?.sessionId || '',
        userId: entry.userId || sessionState?.userId || '',
        email: entry.email || sessionState?.email || '',
      })
    );

    await upsertSession();
    await insertEvent('session', 'visit', {
      sourceType: attribution.sourceType,
      sourceValue: attribution.sourceValue,
      referralCode: attribution.referralCode,
      inviteCode: attribution.inviteCode,
      waitlistToken: attribution.waitlistToken,
      landingPath: window.location.pathname,
    });

    if (liveSessionsTableAvailable) {
      startHeartbeat();
    }
  },

  identifyAuthenticatedUser: async (payload: { userId: string; email?: string }) => {
    if (!sessionState) return;
    await upsertSession({
      userId: sanitize(payload.userId),
      email: sanitize(payload.email),
    });
    await insertEvent('auth', 'login', {
      userId: sanitize(payload.userId),
      email: sanitize(payload.email),
    });
  },

  recordLogout: async () => {
    if (!sessionState) return;
    await insertEvent('auth', 'logout', {});
    await upsertSession({ userId: '', email: '' });
    ClientLogService.clearActorIdentity();
  },

  recordEvent: async (
    eventType: string,
    eventName: string,
    metadata: Record<string, unknown> = {}
  ) => {
    await insertEvent(eventType, eventName, metadata);
  },

  flushAndStop: async () => {
    stopHeartbeat();
    if (!sessionState) return;
    if (!liveSessionsTableAvailable) {
      ClientLogService.setRemoteSink(null);
      return;
    }
    await ClientLogService.withMutedCapture(async () => {
      const { error } = await supabase
        .from('live_sessions')
        .update({ is_active: false, last_seen: getNowIso() })
        .eq('session_id', sessionState!.sessionId);
      if (error) {
        console.warn('AnalyticsService session stop update failed', error.message);
      }
    });
    ClientLogService.setRemoteSink(null);
  },
};
