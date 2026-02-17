import { ClientLogLevel } from './clientLogService';
import { supabase } from '../supabaseClient';

interface AnalyticsEventRow {
  id: string;
  session_id?: string | null;
  user_id?: string | null;
  email?: string | null;
  event_name?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
}

export interface AdminUserLogEntry {
  id: string;
  timestamp: string;
  level: ClientLogLevel;
  source: string;
  message: string;
  context: string;
  sessionId: string;
  userId: string;
  email: string;
}

export interface AdminUserLogQuery {
  userId?: string;
  email?: string;
  limit?: number;
}

export interface AdminUserLogStatus {
  analyticsEventsTableMissing: boolean;
  lastError: string;
}

const sanitize = (value: unknown) => String(value || '').trim();
const MISSING_TABLE_PATTERNS = [
  "Could not find the table 'public.analytics_events' in the schema cache",
  'relation "analytics_events" does not exist',
  'analytics_events',
];

let analyticsEventsMissingUntil = 0;
let lastError = '';

const normalizeLevel = (value: string): ClientLogLevel => {
  const next = value.toLowerCase();
  if (next === 'error') return 'error';
  if (next === 'warn') return 'warn';
  return 'info';
};

const readMetadata = (metadata: Record<string, unknown> | null | undefined) => {
  if (!metadata || typeof metadata !== 'object') return {};
  return metadata;
};

const isMissingAnalyticsEventsTableError = (message: string) => {
  const normalized = sanitize(message).toLowerCase();
  return MISSING_TABLE_PATTERNS.some((pattern) =>
    normalized.includes(pattern.toLowerCase())
  );
};

export const AdminUserLogService = {
  getStatus: (): AdminUserLogStatus => ({
    analyticsEventsTableMissing: Date.now() < analyticsEventsMissingUntil,
    lastError,
  }),

  getUserLogs: async (query: AdminUserLogQuery = {}): Promise<AdminUserLogEntry[]> => {
    if (Date.now() < analyticsEventsMissingUntil) {
      return [];
    }

    const limit = Math.max(1, Math.min(query.limit || 250, 1000));
    const userId = sanitize(query.userId);
    const email = sanitize(query.email);

    let dbQuery = supabase
      .from('analytics_events')
      .select('id,session_id,user_id,email,event_name,metadata,created_at')
      .eq('event_type', 'client_log')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (userId) {
      dbQuery = dbQuery.eq('user_id', userId);
    }
    if (email) {
      dbQuery = dbQuery.ilike('email', email);
    }

    const { data, error } = await dbQuery;
    if (error) {
      lastError = sanitize((error as any)?.message || 'Unknown error loading analytics events.');
      if (isMissingAnalyticsEventsTableError(lastError)) {
        analyticsEventsMissingUntil = Date.now() + 60_000;
        console.warn(
          'Admin user logs disabled: public.analytics_events table is missing. Apply Supabase analytics migrations.'
        );
      } else {
        console.error('Failed to load admin user logs', lastError);
      }
      return [];
    }

    lastError = '';

    return ((data || []) as AnalyticsEventRow[]).map((row) => {
      const metadata = readMetadata(row.metadata);
      const level = normalizeLevel(
        sanitize(row.event_name) || sanitize(metadata.level) || 'info'
      );
      const source = sanitize(metadata.source) || 'console';
      const message = sanitize(metadata.message) || 'No message';
      const context = sanitize(metadata.context);
      const sessionId = sanitize(row.session_id) || sanitize(metadata.sessionId);
      const rowUserId = sanitize(row.user_id) || sanitize(metadata.userId);
      const rowEmail = sanitize(row.email) || sanitize(metadata.email);
      const timestamp = sanitize(row.created_at) || new Date().toISOString();

      return {
        id: row.id,
        timestamp,
        level,
        source,
        message,
        context,
        sessionId,
        userId: rowUserId,
        email: rowEmail,
      };
    });
  },
};
