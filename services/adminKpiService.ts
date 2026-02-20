import { KYCStatus, UserProfile, WaitlistEntry } from '../types';
import { supabase } from '../supabaseClient';

interface LiveSessionRow {
  session_id: string;
  user_id?: string | null;
  email?: string | null;
  is_active?: boolean | null;
  last_seen?: string | null;
  country?: string | null;
  city?: string | null;
  source_type?: string | null;
  source_value?: string | null;
}

export interface SourceMetric {
  source: string;
  count: number;
}

export interface CountryMetric {
  country: string;
  count: number;
}

export interface LiveContactMetric {
  email: string;
  userId: string;
  verification: 'VERIFIED' | 'UNVERIFIED' | 'UNKNOWN';
  source: string;
  location: string;
  lastSeen: string;
}

export interface AdminKpiSnapshot {
  liveUsers: number;
  activeUsers24h: number;
  totalUsers: number;
  verifiedUsers: number;
  unverifiedUsers: number;
  moneyInSystemUsd: number;
  waitlistPending: number;
  sourceBreakdown: SourceMetric[];
  geoHeatmap: CountryMetric[];
  liveContacts: LiveContactMetric[];
  networkMetrics: {
    liveVerified: number;
    liveUnverified: number;
    liveGuests: number;
    referralVisits24h: number;
    inviteVisits24h: number;
    waitlistVisits24h: number;
  };
  headsUp: string[];
}

const LIVE_WINDOW_MS = 5 * 60 * 1000;
const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;

const toNumber = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const safe = (value: string | null | undefined) => (value || '').trim();

const sourceLabel = (sourceType: string, sourceValue: string) => {
  if (!sourceType) return 'direct';
  if (!sourceValue || sourceValue === sourceType) return sourceType;
  return `${sourceType}:${sourceValue}`;
};

const parseIso = (value: string | null | undefined) => {
  const epoch = Date.parse(value || '');
  return Number.isFinite(epoch) ? epoch : 0;
};

const keyForSessionIdentity = (session: LiveSessionRow) =>
  safe(session.user_id) || safe(session.email) || safe(session.session_id);

export const AdminKpiService = {
  getSnapshot: async (users: UserProfile[], waitlist: WaitlistEntry[]): Promise<AdminKpiSnapshot> => {
    const now = Date.now();
    const activeCutoffIso = new Date(now - ACTIVE_WINDOW_MS).toISOString();
    const liveCutoffEpoch = now - LIVE_WINDOW_MS;

    let sessions: LiveSessionRow[] = [];
    try {
      const { data, error } = await supabase
        .from('live_sessions')
        .select('*')
        .gte('last_seen', activeCutoffIso)
        .order('last_seen', { ascending: false })
        .limit(1500);
      if (!error && data) {
        sessions = data as LiveSessionRow[];
      }
    } catch {
      sessions = [];
    }

    const verifiedUsers = users.filter((u) => u.kycStatus === KYCStatus.VERIFIED).length;
    const unverifiedUsers = Math.max(0, users.length - verifiedUsers);
    const moneyInSystemUsd = users.reduce((sum, user) => sum + toNumber(user.balance), 0);
    const waitlistPending = waitlist.filter((entry) => entry.status === 'PENDING').length;

    const activeIdentityKeys = new Set<string>();
    sessions.forEach((session) => {
      const key = keyForSessionIdentity(session);
      if (key) activeIdentityKeys.add(key);
    });

    const liveSessions = sessions.filter((session) => {
      const lastSeenEpoch = parseIso(session.last_seen);
      return Boolean(session.is_active !== false && lastSeenEpoch >= liveCutoffEpoch);
    });

    const liveIdentityKeys = new Set<string>();
    liveSessions.forEach((session) => {
      const key = keyForSessionIdentity(session);
      if (key) liveIdentityKeys.add(key);
    });

    const emailLookup = new Map<string, UserProfile>();
    const userIdLookup = new Map<string, UserProfile>();
    users.forEach((user) => {
      if (safe(user.email)) emailLookup.set(safe(user.email).toLowerCase(), user);
      if (safe(user.id)) userIdLookup.set(safe(user.id), user);
    });

    let liveVerified = 0;
    let liveUnverified = 0;
    const seenLiveIdentity = new Set<string>();
    liveSessions.forEach((session) => {
      const identityKey = keyForSessionIdentity(session);
      if (!identityKey || seenLiveIdentity.has(identityKey)) return;
      seenLiveIdentity.add(identityKey);

      const user =
        userIdLookup.get(safe(session.user_id)) ||
        emailLookup.get(safe(session.email).toLowerCase());
      if (!user) return;
      if (user.kycStatus === KYCStatus.VERIFIED) {
        liveVerified += 1;
      } else {
        liveUnverified += 1;
      }
    });

    const sourceMap = new Map<string, number>();
    sessions.forEach((session) => {
      const label = sourceLabel(safe(session.source_type), safe(session.source_value));
      sourceMap.set(label, (sourceMap.get(label) || 0) + 1);
    });

    const sourceBreakdown: SourceMetric[] = Array.from(sourceMap.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const geoMap = new Map<string, number>();
    sessions.forEach((session) => {
      const country = safe(session.country) || 'Unknown';
      geoMap.set(country, (geoMap.get(country) || 0) + 1);
    });

    const geoHeatmap: CountryMetric[] = Array.from(geoMap.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    const seenEmails = new Set<string>();
    const liveContacts: LiveContactMetric[] = [];
    liveSessions.forEach((session) => {
      const email = safe(session.email);
      if (!email || seenEmails.has(email.toLowerCase())) return;
      seenEmails.add(email.toLowerCase());

      const user =
        userIdLookup.get(safe(session.user_id)) ||
        emailLookup.get(email.toLowerCase());
      const verification = user
        ? user.kycStatus === KYCStatus.VERIFIED
          ? 'VERIFIED'
          : 'UNVERIFIED'
        : 'UNKNOWN';

      liveContacts.push({
        email,
        userId: safe(session.user_id) || safe(user?.id) || 'guest',
        verification,
        source: sourceLabel(safe(session.source_type), safe(session.source_value)),
        location: `${safe(session.city) || 'Unknown'}, ${safe(session.country) || 'Unknown'}`,
        lastSeen: safe(session.last_seen) || new Date().toISOString(),
      });
    });

    const referralVisits24h = sessions.filter((s) => safe(s.source_type) === 'referral_code').length;
    const inviteVisits24h = sessions.filter((s) => safe(s.source_type) === 'invite_link').length;
    const waitlistVisits24h = sessions.filter((s) => safe(s.source_type) === 'waitlist_invite').length;

    const headsUp: string[] = [];
    if (liveIdentityKeys.size === 0) {
      headsUp.push('No live users detected in the last 5 minutes.');
    } else {
      headsUp.push(`${liveIdentityKeys.size} users are live right now.`);
    }
    headsUp.push(`$${moneyInSystemUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })} is currently in system balances.`);
    if (unverifiedUsers > verifiedUsers) {
      headsUp.push('Unverified accounts currently outnumber verified accounts.');
    }
    if (waitlistPending > 0) {
      headsUp.push(`${waitlistPending} users are still waiting in the waitlist queue.`);
    }
    if (referralVisits24h + inviteVisits24h + waitlistVisits24h > 0) {
      headsUp.push(
        `Attribution in last 24h: ${referralVisits24h} referral, ${inviteVisits24h} invite-link, ${waitlistVisits24h} waitlist-invite sessions.`
      );
    }

    return {
      liveUsers: liveIdentityKeys.size,
      activeUsers24h: activeIdentityKeys.size,
      totalUsers: users.length,
      verifiedUsers,
      unverifiedUsers,
      moneyInSystemUsd,
      waitlistPending,
      sourceBreakdown,
      geoHeatmap,
      liveContacts: liveContacts.slice(0, 40),
      networkMetrics: {
        liveVerified,
        liveUnverified,
        liveGuests: Math.max(0, liveIdentityKeys.size - liveVerified - liveUnverified),
        referralVisits24h,
        inviteVisits24h,
        waitlistVisits24h,
      },
      headsUp,
    };
  },
};

