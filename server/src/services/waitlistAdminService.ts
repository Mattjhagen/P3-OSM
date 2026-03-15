import { config } from '../config/config';
import { resolveAuthUser, supabase } from '../config/supabase';
import { ManualInviteResult, WaitlistInviteService } from './waitlistInviteService';

const trim = (value: unknown) => String(value || '').trim();
const normalizeEmail = (value: string) => trim(value).toLowerCase();
const parseBearerToken = (authorizationHeader?: string) => {
  const raw = trim(authorizationHeader);
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? trim(match[1]) : '';
};

const WAITLIST_SELECT_BASE_FIELDS = 'id,name,email,status,created_at';
const WAITLIST_SELECT_FIELDS =
  `${WAITLIST_SELECT_BASE_FIELDS},referral_code,referred_by,referral_count,waitlist_score`;
const ALLOWED_ADMIN_ROLES = new Set(['ADMIN', 'RISK_OFFICER', 'SUPPORT']);
const OPTIONAL_WAITLIST_COLUMNS = [
  'referral_code',
  'referred_by',
  'referral_count',
  'waitlist_score',
] as const;

export class WaitlistAdminError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface WaitlistAdminQueueRow {
  id: string;
  name: string;
  email: string;
  status: 'PENDING' | 'INVITED' | 'ONBOARDED' | string;
  created_at: string;
  referral_code?: string | null;
  referred_by?: string | null;
  referral_count?: number;
  waitlist_score?: number;
}

export interface WaitlistAdminQueueResult {
  rows: WaitlistAdminQueueRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface WaitlistAdminInviteResult {
  requested: number;
  updated: number;
  queued: number;
  skipped: number;
  rows: WaitlistAdminQueueRow[];
}

export interface WaitlistAdminSyncResult {
  source: 'supabase_waitlist';
  scanned: number;
  inserted: number;
  skipped: number;
  syncedAt: string;
  total: number;
  pending: number;
  invited: number;
  onboarded: number;
}

export type WaitlistAdminManualInviteResult = ManualInviteResult;

const formatRow = (row: any): WaitlistAdminQueueRow => ({
  id: String(row?.id || ''),
  name: String(row?.name || ''),
  email: String(row?.email || ''),
  status: String(row?.status || 'PENDING').toUpperCase(),
  created_at: String(row?.created_at || ''),
  referral_code: row?.referral_code ? String(row.referral_code) : null,
  referred_by: row?.referred_by ? String(row.referred_by) : null,
  referral_count: Number(row?.referral_count || 0),
  waitlist_score: Number(row?.waitlist_score || 0),
});

const isMissingOptionalWaitlistColumn = (message: string) => {
  const normalized = trim(message).toLowerCase();
  if (!normalized) return false;

  const looksLikeColumnError =
    (normalized.includes('column') && normalized.includes('does not exist')) ||
    normalized.includes('schema cache');
  if (!looksLikeColumnError) return false;

  return OPTIONAL_WAITLIST_COLUMNS.some((column) => normalized.includes(column));
};

const assertAuthorizedAdmin = async (
  adminEmail: string,
  authorizationHeader?: string
) => {
  const normalizedAdminEmail = normalizeEmail(adminEmail);
  if (!normalizedAdminEmail) {
    throw new WaitlistAdminError(400, 'adminEmail is required.');
  }

  const expectedInternalBearer = trim(config.admin.internalBearer);
  const bearerToken = parseBearerToken(authorizationHeader);

  if (config.isProd) {
    if (!expectedInternalBearer) {
      throw new WaitlistAdminError(
        503,
        'Admin waitlist routes require ADMIN_INTERNAL_BEARER in production.'
      );
    }

    if (!bearerToken || bearerToken !== expectedInternalBearer) {
      throw new WaitlistAdminError(
        401,
        'Missing or invalid internal admin bearer token.'
      );
    }
  } else if (expectedInternalBearer) {
    if (!bearerToken || bearerToken !== expectedInternalBearer) {
      throw new WaitlistAdminError(
        401,
        'Missing or invalid internal admin bearer token.'
      );
    }
  } else if (bearerToken) {
    const { data, error } = await resolveAuthUser(bearerToken);
    if (error || !data?.user) {
      throw new WaitlistAdminError(401, 'Invalid or expired admin bearer token.');
    }

    const authEmail = normalizeEmail(data.user.email || '');
    if (authEmail && authEmail !== normalizedAdminEmail) {
      throw new WaitlistAdminError(403, 'Admin token does not match adminEmail.');
    }
  }

  const { data, error } = await supabase
    .from('employees')
    .select('id,email,role,is_active')
    .eq('email', normalizedAdminEmail)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new WaitlistAdminError(
      500,
      `Failed to validate admin identity: ${error.message}`
    );
  }

  if (!data) {
    throw new WaitlistAdminError(403, 'Admin user is not active in employee records.');
  }

  const role = trim((data as any)?.role).toUpperCase();
  if (!ALLOWED_ADMIN_ROLES.has(role)) {
    throw new WaitlistAdminError(
      403,
      'Admin user does not have waitlist management permissions.'
    );
  }
};

/** Exported for use by other admin services (e.g. telemetry). */
export async function assertAdmin(adminEmail: string, authorizationHeader?: string): Promise<void> {
  await assertAuthorizedAdmin(adminEmail, authorizationHeader);
}

const getRowsByIds = async (ids: string[]) => {
  if (ids.length === 0) return [];

  const primary = await supabase
    .from('waitlist')
    .select(WAITLIST_SELECT_FIELDS)
    .in('id', ids)
    .order('created_at', { ascending: true });
  let data: any[] | null = primary.data as any[] | null;
  let error = primary.error;

  if (error && isMissingOptionalWaitlistColumn(error.message || '')) {
    const fallback = await supabase
      .from('waitlist')
      .select(WAITLIST_SELECT_BASE_FIELDS)
      .in('id', ids)
      .order('created_at', { ascending: true });
    data = fallback.data as any[] | null;
    error = fallback.error;
  }

  if (error) {
    throw new WaitlistAdminError(
      500,
      `Failed to fetch updated waitlist rows: ${error.message}`
    );
  }

  return (data || []).map(formatRow);
};

const applyInviteUpdate = async (ids: string[]) => {
  const { error } = await supabase
    .from('waitlist')
    .update({ status: 'INVITED' })
    .in('id', ids);

  if (error) {
    throw new WaitlistAdminError(
      500,
      `Failed to update waitlist invite status: ${error.message}`
    );
  }
};

const resolveCountForStatus = async (
  status?: 'PENDING' | 'INVITED' | 'ONBOARDED'
) => {
  let query = supabase.from('waitlist').select('id', { count: 'exact', head: true });
  if (status) {
    query = query.eq('status', status);
  }

  const { count, error } = await query;
  if (error) {
    throw new WaitlistAdminError(
      500,
      `Failed to count waitlist rows: ${error.message}`
    );
  }

  return Number(count || 0);
};

export const WaitlistAdminService = {
  getWaitlistQueue: async (payload: {
    adminEmail: string;
    authorizationHeader?: string;
    page: number;
    pageSize: number;
  }): Promise<WaitlistAdminQueueResult> => {
    await assertAuthorizedAdmin(payload.adminEmail, payload.authorizationHeader);

    const page = Math.max(1, Math.floor(payload.page));
    const pageSize = Math.max(1, Math.min(500, Math.floor(payload.pageSize)));
    const offset = (page - 1) * pageSize;

    const primary = await supabase
      .from('waitlist')
      .select(WAITLIST_SELECT_FIELDS, { count: 'exact' })
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1);
    let data: any[] | null = primary.data as any[] | null;
    let error = primary.error;
    let count = primary.count;

    if (error && isMissingOptionalWaitlistColumn(error.message || '')) {
      const fallback = await supabase
        .from('waitlist')
        .select(WAITLIST_SELECT_BASE_FIELDS, { count: 'exact' })
        .order('created_at', { ascending: true })
        .range(offset, offset + pageSize - 1);
      data = fallback.data as any[] | null;
      error = fallback.error;
      count = fallback.count;
    }

    if (error) {
      throw new WaitlistAdminError(
        500,
        `Failed to fetch waitlist queue: ${error.message}`
      );
    }

    return {
      rows: (data || []).map(formatRow),
      total: Number(count || 0),
      page,
      pageSize,
    };
  },

  inviteWaitlistById: async (payload: {
    adminEmail: string;
    authorizationHeader?: string;
    waitlistId: string;
  }): Promise<WaitlistAdminInviteResult> => {
    await assertAuthorizedAdmin(payload.adminEmail, payload.authorizationHeader);

    const waitlistId = trim(payload.waitlistId);
    if (!waitlistId) {
      throw new WaitlistAdminError(400, 'waitlistId is required.');
    }

    const { data: row, error } = await supabase
      .from('waitlist')
      .select('id,status')
      .eq('id', waitlistId)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new WaitlistAdminError(
        500,
        `Failed to fetch waitlist row: ${error.message}`
      );
    }
    if (!row) {
      throw new WaitlistAdminError(404, 'Waitlist row was not found.');
    }

    if (String(row.status || '').toUpperCase() !== 'PENDING') {
      return {
        requested: 1,
        updated: 0,
        queued: 0,
        skipped: 1,
        rows: [],
      };
    }

    await applyInviteUpdate([waitlistId]);
    const rows = await getRowsByIds([waitlistId]);

    return {
      requested: 1,
      updated: rows.length,
      queued: rows.length,
      skipped: Math.max(0, 1 - rows.length),
      rows,
    };
  },

  inviteNextWaitlist: async (payload: {
    adminEmail: string;
    authorizationHeader?: string;
    batchSize: number;
  }): Promise<WaitlistAdminInviteResult> => {
    await assertAuthorizedAdmin(payload.adminEmail, payload.authorizationHeader);

    const batchSize = Math.max(1, Math.min(250, Math.floor(payload.batchSize)));
    const { data: rows, error } = await supabase
      .from('waitlist')
      .select('id')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (error) {
      throw new WaitlistAdminError(
        500,
        `Failed to select pending waitlist rows: ${error.message}`
      );
    }

    const ids = (rows || [])
      .map((row: any) => trim(row?.id))
      .filter(Boolean);

    if (ids.length === 0) {
      return {
        requested: batchSize,
        updated: 0,
        queued: 0,
        skipped: batchSize,
        rows: [],
      };
    }

    await applyInviteUpdate(ids);
    const updatedRows = await getRowsByIds(ids);

    return {
      requested: batchSize,
      updated: updatedRows.length,
      queued: updatedRows.length,
      skipped: Math.max(0, batchSize - updatedRows.length),
      rows: updatedRows,
    };
  },

  syncWaitlist: async (payload: {
    adminEmail: string;
    authorizationHeader?: string;
  }): Promise<WaitlistAdminSyncResult> => {
    await assertAuthorizedAdmin(payload.adminEmail, payload.authorizationHeader);

    const [total, pending, invited, onboarded] = await Promise.all([
      resolveCountForStatus(),
      resolveCountForStatus('PENDING'),
      resolveCountForStatus('INVITED'),
      resolveCountForStatus('ONBOARDED'),
    ]);

    return {
      source: 'supabase_waitlist',
      scanned: total,
      inserted: 0,
      skipped: total,
      syncedAt: new Date().toISOString(),
      total,
      pending,
      invited,
      onboarded,
    };
  },

  manualInviteWaitlist: async (payload: {
    adminEmail: string;
    adminName: string;
    authorizationHeader?: string;
    email: string;
    name?: string;
  }): Promise<WaitlistAdminManualInviteResult> => {
    await assertAuthorizedAdmin(payload.adminEmail, payload.authorizationHeader);

    return WaitlistInviteService.sendManualInvite({
      adminEmail: payload.adminEmail,
      adminName: payload.adminName,
      email: payload.email,
      name: payload.name,
    });
  },
};
