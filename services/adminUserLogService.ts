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

const sanitize = (value: unknown) => String(value || '').trim();

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

export const AdminUserLogService = {
  getUserLogs: async (query: AdminUserLogQuery = {}): Promise<AdminUserLogEntry[]> => {
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
      console.error('Failed to load admin user logs', error.message);
      return [];
    }

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

