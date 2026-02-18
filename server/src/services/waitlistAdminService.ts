import { config } from '../config/config';
import { resolveAuthUser, supabase } from '../config/supabase';

const trim = (value: unknown) => String(value || '').trim();
const normalizeEmail = (value: string) => trim(value).toLowerCase();
const parseBearerToken = (authorizationHeader?: string) => {
  const raw = trim(authorizationHeader);
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? trim(match[1]) : '';
};

const ALLOWED_ADMIN_ROLES = new Set(['ADMIN', 'RISK_OFFICER', 'SUPPORT']);
const WAITLIST_SELECT_LEGACY =
  'id,name,email,status,created_at,referral_code,referred_by,referral_count,waitlist_score';
const WAITLIST_SELECT_WITH_INVITE =
  `${WAITLIST_SELECT_LEGACY},invite_status,invited_at,onboarded_at,invite_batch_id`;

type WaitlistInviteStatus = 'pending' | 'invited' | 'onboarded' | 'blocked';

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
  status: 'PENDING' | 'INVITED' | 'ONBOARDED' | 'BLOCKED' | string;
  invite_status: WaitlistInviteStatus;
  created_at: string;
  invited_at?: string | null;
  onboarded_at?: string | null;
  invite_batch_id?: string | null;
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

const toInviteStatus = (value: unknown): WaitlistInviteStatus => {
  const normalized = trim(value).toLowerCase();
  if (normalized === 'invited') return 'invited';
  if (normalized === 'onboarded') return 'onboarded';
  if (normalized === 'blocked') return 'blocked';
  return 'pending';
};

const toLegacyStatus = (
  inviteStatus: WaitlistInviteStatus
): WaitlistAdminQueueRow['status'] => {
  if (inviteStatus === 'invited') return 'INVITED';
  if (inviteStatus === 'onboarded') return 'ONBOARDED';
  if (inviteStatus === 'blocked') return 'BLOCKED';
  return 'PENDING';
};

const formatRow = (row: any): WaitlistAdminQueueRow => {
  const inviteStatus = toInviteStatus(row?.invite_status || row?.status);
  return {
    id: String(row?.id || ''),
    name: String(row?.name || ''),
    email: String(row?.email || ''),
    status: toLegacyStatus(inviteStatus),
    invite_status: inviteStatus,
    created_at: String(row?.created_at || ''),
    invited_at: row?.invited_at ? String(row.invited_at) : null,
    onboarded_at: row?.onboarded_at ? String(row.onboarded_at) : null,
    invite_batch_id: row?.invite_batch_id ? String(row.invite_batch_id) : null,
    referral_code: row?.referral_code ? String(row.referral_code) : null,
    referred_by: row?.referred_by ? String(row.referred_by) : null,
    referral_count: Number(row?.referral_count || 0),
    waitlist_score: Number(row?.waitlist_score || 0),
  };
};

const isColumnUnavailable = (message: string, columnName: string) => {
  const normalized = trim(message).toLowerCase();
  const target = trim(columnName).toLowerCase();
  if (!normalized || !target) return false;
  return (
    (normalized.includes('column') && normalized.includes(target) && normalized.includes('does not exist')) ||
    (normalized.includes('schema cache') && normalized.includes(target))
  );
};

const canFallbackFromInviteColumns = (message: string) =>
  isColumnUnavailable(message, 'invite_status') ||
  isColumnUnavailable(message, 'invited_at') ||
  isColumnUnavailable(message, 'onboarded_at') ||
  isColumnUnavailable(message, 'invite_batch_id');

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

  if (expectedInternalBearer) {
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

const getRowsByIds = async (ids: string[]) => {
  if (ids.length === 0) return [];

  const query = supabase
    .from('waitlist')
    .select(WAITLIST_SELECT_WITH_INVITE)
    .in('id', ids)
    .order('created_at', { ascending: true });
  const inviteResult = await query;
  let data: any[] | null = (inviteResult.data || []) as any[];
  let error = inviteResult.error;

  if (error && canFallbackFromInviteColumns(error.message || '')) {
    const legacyQuery = supabase
      .from('waitlist')
      .select(WAITLIST_SELECT_LEGACY)
      .in('id', ids)
      .order('created_at', { ascending: true });
    const legacyResult = await legacyQuery;
    data = (legacyResult.data || []) as any[];
    error = legacyResult.error;
  }

  if (error) {
    throw new WaitlistAdminError(
      500,
      `Failed to fetch updated waitlist rows: ${error.message}`
    );
  }

  return (data || []).map(formatRow);
};

const applyInviteUpdate = async (ids: string[], batchId?: string) => {
  const invitedAt = new Date().toISOString();
  const fullPayload = {
    status: 'INVITED',
    invite_status: 'invited',
    invited_at: invitedAt,
    invite_batch_id: batchId || null,
  };

  let result = await supabase.from('waitlist').update(fullPayload).in('id', ids);
  if (!result.error) return;

  if (!canFallbackFromInviteColumns(result.error.message || '')) {
    throw new WaitlistAdminError(
      500,
      `Failed to update waitlist invite status: ${result.error.message}`
    );
  }

  result = await supabase
    .from('waitlist')
    .update({
      status: 'INVITED',
      invited_at: invitedAt,
    })
    .in('id', ids);
  if (!result.error) return;

  if (!canFallbackFromInviteColumns(result.error.message || '')) {
    throw new WaitlistAdminError(
      500,
      `Failed to update waitlist invite status: ${result.error.message}`
    );
  }

  const legacyResult = await supabase
    .from('waitlist')
    .update({ status: 'INVITED' })
    .in('id', ids);
  if (legacyResult.error) {
    throw new WaitlistAdminError(
      500,
      `Failed to update waitlist invite status: ${legacyResult.error.message}`
    );
  }
};

const resolveCountForStatus = async (status?: WaitlistInviteStatus) => {
  let inviteQuery = supabase.from('waitlist').select('id', { count: 'exact', head: true });
  if (status) {
    inviteQuery = inviteQuery.eq('invite_status', status);
  }

  let { count, error } = await inviteQuery;
  if (error && canFallbackFromInviteColumns(error.message || '')) {
    let legacyQuery = supabase.from('waitlist').select('id', { count: 'exact', head: true });
    if (status) {
      legacyQuery = legacyQuery.eq('status', toLegacyStatus(status));
    }
    const legacyResult = await legacyQuery;
    count = legacyResult.count;
    error = legacyResult.error;
  }

  if (error) {
    throw new WaitlistAdminError(
      500,
      `Failed to count waitlist rows: ${error.message}`
    );
  }

  return Number(count || 0);
};

const getQueuePage = async (offset: number, pageSize: number) => {
  const inviteResult = await supabase
    .from('waitlist')
    .select(WAITLIST_SELECT_WITH_INVITE, { count: 'exact' })
    .order('created_at', { ascending: true })
    .range(offset, offset + pageSize - 1);

  if (!inviteResult.error) {
    return inviteResult;
  }

  if (!canFallbackFromInviteColumns(inviteResult.error.message || '')) {
    return inviteResult;
  }

  return supabase
    .from('waitlist')
    .select(WAITLIST_SELECT_LEGACY, { count: 'exact' })
    .order('created_at', { ascending: true })
    .range(offset, offset + pageSize - 1);
};

const getWaitlistRowById = async (waitlistId: string) => {
  const inviteResult = await supabase
    .from('waitlist')
    .select('id,status,invite_status')
    .eq('id', waitlistId)
    .limit(1)
    .maybeSingle();

  if (!inviteResult.error) {
    return inviteResult;
  }

  if (!canFallbackFromInviteColumns(inviteResult.error.message || '')) {
    return inviteResult;
  }

  const legacyResult = await supabase
    .from('waitlist')
    .select('id,status')
    .eq('id', waitlistId)
    .limit(1)
    .maybeSingle();

  return legacyResult;
};

const getPendingWaitlistIds = async (batchSize: number) => {
  const inviteResult = await supabase
    .from('waitlist')
    .select('id')
    .eq('invite_status', 'pending')
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (!inviteResult.error) {
    return inviteResult;
  }

  if (!canFallbackFromInviteColumns(inviteResult.error.message || '')) {
    return inviteResult;
  }

  const legacyResult = await supabase
    .from('waitlist')
    .select('id')
    .eq('status', 'PENDING')
    .order('created_at', { ascending: true })
    .limit(batchSize);

  return legacyResult;
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

    const { data, error, count } = await getQueuePage(offset, pageSize);

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

    const { data: row, error } = await getWaitlistRowById(waitlistId);
    if (error) {
      throw new WaitlistAdminError(
        500,
        `Failed to fetch waitlist row: ${error.message}`
      );
    }
    if (!row) {
      throw new WaitlistAdminError(404, 'Waitlist row was not found.');
    }

    const inviteStatus = toInviteStatus((row as any)?.invite_status || (row as any)?.status);
    if (inviteStatus !== 'pending') {
      return {
        requested: 1,
        updated: 0,
        queued: 0,
        skipped: 1,
        rows: [],
      };
    }

    await applyInviteUpdate([waitlistId], `batch_${Date.now()}`);
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
    const { data: rows, error } = await getPendingWaitlistIds(batchSize);
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

    await applyInviteUpdate(ids, `batch_${Date.now()}`);
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
      resolveCountForStatus('pending'),
      resolveCountForStatus('invited'),
      resolveCountForStatus('onboarded'),
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
};
