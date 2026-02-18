import { UserProfile, LoanRequest, LoanOffer, EmployeeProfile, ReferralData, InternalTicket, ChatMessage, Dispute, KYCTier, KYCStatus, WaitlistEntry } from '../types';
import { supabase } from '../supabaseClient';
import { AdminNotificationClient } from './adminNotificationClient';
import { frontendEnv } from './env';
import { RuntimeConfigService } from './runtimeConfigService';

// INITIAL TEMPLATE REMAINING FOR FALLBACK
const INITIAL_USER_TEMPLATE: UserProfile = {
  id: 'guest',
  name: 'Guest User',
  income: 0,
  balance: 0,
  avatarUrl: undefined,
  employmentStatus: 'Unemployed',
  financialHistory: 'New account.',
  reputationScore: 50,
  riskAnalysis: 'Insufficient data for analysis.',
  successfulRepayments: 0,
  currentStreak: 0,
  badges: [],
  kycTier: KYCTier.TIER_0,
  kycStatus: KYCStatus.UNVERIFIED,
  kycLimit: 0,
  mentorshipsCount: 0,
  walletAgeDays: 0, 
  txCount: 0,
  referrals: []
};

const BASE_WAITLIST_COUNT = 4291;
const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');
const normalizeBackendBaseUrl = (value: string) =>
  trimTrailingSlash(value).replace(/\/api$/i, '');
const getBackendBaseUrl = () =>
  normalizeBackendBaseUrl(
    RuntimeConfigService.getEffectiveValue('BACKEND_URL', frontendEnv.VITE_BACKEND_URL)
  );
const truncate = (value: string, max = 400) => (value.length > max ? `${value.slice(0, max - 3)}...` : value);

const toMillis = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string' && value.trim()) {
    const direct = Number(value);
    if (Number.isFinite(direct) && direct > 0) return direct;
    const parsedDate = new Date(value).getTime();
    if (Number.isFinite(parsedDate) && parsedDate > 0) return parsedDate;
  }
  return Date.now();
};

const parseChatType = (value: unknown): 'INTERNAL' | 'CUSTOMER_SUPPORT' =>
  String(value || '').toUpperCase() === 'INTERNAL' ? 'INTERNAL' : 'CUSTOMER_SUPPORT';

const toChatMessage = (row: any): ChatMessage | null => {
  const payload = row?.data && typeof row.data === 'object' ? row.data : {};
  const id = String(payload.id || row?.id || '').trim();
  const senderId = String(payload.senderId || row?.sender_id || '').trim();
  const message = String(payload.message || row?.message || '').trim();

  if (!id || !senderId || !message) return null;

  const threadIdRaw = payload.threadId || row?.thread_id || undefined;
  const threadId = typeof threadIdRaw === 'string' && threadIdRaw.trim() ? threadIdRaw : undefined;

  return {
    id,
    senderId,
    senderName: String(payload.senderName || row?.sender_name || 'User'),
    role: (payload.role || row?.role || 'CUSTOMER') as ChatMessage['role'],
    message,
    timestamp: toMillis(payload.timestamp || row?.created_at),
    type: parseChatType(payload.type || row?.type),
    threadId,
  };
};

const markUserWaitlistOnboarded = async (payload: {
  email?: string | null;
  name?: string | null;
}) => {
  const normalizedEmail = String(payload.email || '').trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes('@')) return;

  const displayName =
    String(payload.name || '').trim() || normalizedEmail.split('@')[0] || 'User';

  const { data: waitlistData, error: waitlistError } = await supabase
    .from('waitlist')
    .select('id,status')
    .eq('email', normalizedEmail)
    .limit(1)
    .maybeSingle();

  if (waitlistError && String((waitlistError as any).code || '') !== 'PGRST116') {
    console.warn('Unable to read waitlist row for onboarding sync', waitlistError);
    return;
  }

  if (waitlistData?.id) {
    if (waitlistData.status !== 'ONBOARDED') {
      await PersistenceService.updateWaitlistStatus(waitlistData.id, 'ONBOARDED');
    }
    return;
  }

  const signup = await PersistenceService.addToWaitlist(displayName, normalizedEmail);
  if (!signup?.id) {
    console.warn('Unable to seed waitlist row for authenticated Netlify user');
    return;
  }

  await PersistenceService.updateWaitlistStatus(signup.id, 'ONBOARDED');
};

export interface NetlifyWaitlistSyncResult {
  source: 'netlify_forms';
  siteId: string;
  formId: string;
  formName: string;
  scanned: number;
  inserted: number;
  skipped: number;
  syncedAt: string;
}

export interface WaitlistSignupResult {
  id: string;
  name: string;
  email: string;
  position: number;
  referralCode: string;
  referredBy: string | null;
  referralCount: number;
  waitlistScore: number;
  isExisting: boolean;
}

// NOTE: All methods are now ASYNC because they hit the database.
export const PersistenceService = {
  
  // --- Waitlist Management ---

  addToWaitlist: async (
    name: string,
    email: string,
    referralCode?: string | null
  ): Promise<WaitlistSignupResult | null> => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = name.trim();
    const normalizedRef = (referralCode || '').trim().toUpperCase();

    try {
      const { data, error } = await supabase.rpc('create_waitlist_signup', {
        name_input: normalizedName,
        email_input: normalizedEmail,
        ref_code_input: normalizedRef || null,
      });

      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;

      const rank = Number(row.queue_position ?? row.position);
      const resolvedPosition = Number.isFinite(rank)
        ? BASE_WAITLIST_COUNT + rank
        : BASE_WAITLIST_COUNT + 1;

      return {
        id: String(row.signup_id || row.id || ''),
        name: String(row.name || normalizedName || normalizedEmail.split('@')[0] || 'User'),
        email: String(row.email || normalizedEmail),
        position: resolvedPosition,
        referralCode: String(row.referral_code || ''),
        referredBy: row.referred_by ? String(row.referred_by) : null,
        referralCount: Number(row.referral_count || 0),
        waitlistScore: Number(row.waitlist_score || 0),
        isExisting: Boolean(row.is_existing),
      };
    } catch (e) {
      console.error("Failed to add to waitlist", e);
      return null;
    }
  },

  getWaitlist: async (): Promise<WaitlistEntry[]> => {
    // Queue ranking is score-first, then FIFO for deterministic ties.
    const { data } = await supabase
      .from('waitlist')
      .select('*')
      .order('waitlist_score', { ascending: false })
      .order('created_at', { ascending: true });

    return data ? data.map((r: any) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      status: r.status,
      created_at: r.created_at,
      referral_code: r.referral_code || undefined,
      referred_by: r.referred_by || undefined,
      referral_count: Number(r.referral_count || 0),
      waitlist_score: Number(r.waitlist_score || 0),
    })) : [];
  },

  // Returns the user's specific position and name if found
  getWaitlistPosition: async (
    email: string
  ): Promise<{
    position: number;
    name: string;
    referralCode?: string;
    referralCount?: number;
    waitlistScore?: number;
  } | null> => {
    try {
      const { data, error } = await supabase.rpc('waitlist_position', {
        email_input: email.trim().toLowerCase(),
      });
      if (error || !data || data.length === 0) return null;

      const row = data[0];
      const rank = Number(row.queue_position ?? row.position);
      if (!Number.isFinite(rank)) return null;
      return {
        position: BASE_WAITLIST_COUNT + rank,
        name: row.name,
        referralCode: row.referral_code || undefined,
        referralCount: Number(row.referral_count || 0),
        waitlistScore: Number(row.waitlist_score || 0),
      };
    } catch (e) {
      console.error("Error fetching position", e);
      return null;
    }
  },

  getWaitlistCount: async (): Promise<number> => {
    try {
      const { data, error } = await supabase.rpc('waitlist_count');
      if (error || data === null || data === undefined) return BASE_WAITLIST_COUNT;
      return BASE_WAITLIST_COUNT + Number(data);
    } catch (e) {
      return BASE_WAITLIST_COUNT;
    }
  },

  updateWaitlistStatus: async (id: string, status: 'INVITED' | 'ONBOARDED') => {
    await supabase.from('waitlist').update({ status }).eq('id', id);
  },

  inviteWaitlistBatch: async (count: number) => {
    // 1. Fetch the IDs of the oldest 'PENDING' users
    const { data: pendingUsers } = await supabase
      .from('waitlist')
      .select('id')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true })
      .limit(count);

    if (!pendingUsers || pendingUsers.length === 0) return;

    const idsToUpdate = pendingUsers.map((u: any) => u.id);

    // 2. Update status to INVITED
    await supabase
      .from('waitlist')
      .update({ status: 'INVITED' })
      .in('id', idsToUpdate);
  },

  syncWaitlistFromNetlify: async (
    adminEmail: string,
    adminName: string
  ): Promise<NetlifyWaitlistSyncResult> => {
    const normalizedEmail = String(adminEmail || '').trim().toLowerCase();
    if (!normalizedEmail) {
      throw new Error('Admin email is required to sync Netlify waitlist.');
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error('Authenticated admin session is required for Netlify waitlist sync.');
    }

    let response: Response;
    try {
      response = await fetch(`${getBackendBaseUrl()}/api/waitlist/sync-netlify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          adminEmail: normalizedEmail,
          adminName: String(adminName || '').trim(),
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown network error';
      throw new Error(`Unable to reach backend for waitlist sync: ${message}`);
    }

    let body: any = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok || !body?.success) {
      throw new Error(body?.error || 'Failed to sync Netlify waitlist.');
    }

    return body.data as NetlifyWaitlistSyncResult;
  },

  // --- User Profile ---
  
  loadUser: async (netlifyUser: any, pendingReferralCode?: string | null): Promise<UserProfile> => {
    if (!netlifyUser) return INITIAL_USER_TEMPLATE;

    try {
      // 1. Try to fetch existing user
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', netlifyUser.id)
        .single();

      if (data) {
        // User exists, return parsed data
        await markUserWaitlistOnboarded({
          email: netlifyUser.email,
          name: data?.data?.name || netlifyUser.user_metadata?.full_name || netlifyUser.email,
        });
        return { ...data.data, id: data.id, email: data.email }; // Flatten jsonb
      } else {
        // 2. Create New User
        const newUser: UserProfile = {
          ...INITIAL_USER_TEMPLATE,
          id: netlifyUser.id,
          email: netlifyUser.email || '',
          name: netlifyUser.user_metadata?.full_name || netlifyUser.email.split('@')[0],
          avatarUrl: netlifyUser.user_metadata?.avatar_url || undefined,
        };

        // Handle Referral
        if (pendingReferralCode && pendingReferralCode !== newUser.id) {
           await PersistenceService.registerReferral(pendingReferralCode, newUser.id);
           newUser.referredBy = pendingReferralCode;
        }

        // Insert into DB
        await supabase.from('users').insert({
          id: newUser.id,
          email: netlifyUser.email,
          data: newUser 
        });

        await markUserWaitlistOnboarded({
          email: netlifyUser.email,
          name: newUser.name,
        });

        return newUser;
      }
    } catch (e) {
      console.error("DB Load Error", e);
      return INITIAL_USER_TEMPLATE;
    }
  },

  saveUser: async (user: UserProfile) => {
    // Separate ID from data blob to avoid duplication
    const { id, ...userData } = user;
    await supabase
      .from('users')
      .upsert({ id: id, data: user });
  },

  getAllUsers: async (): Promise<UserProfile[]> => {
    const { data } = await supabase.from('users').select('*');
    return data
      ? data.map((r: any) => ({
          ...(r.data || {}),
          id: r.id || r.data?.id,
          email: r.email || r.data?.email || '',
        }))
      : [];
  },

  registerReferral: async (referrerId: string, newUserId: string) => {
    // Fetch Referrer
    const { data } = await supabase.from('users').select('*').eq('id', referrerId).single();
    if (data) {
      const profile = data.data as UserProfile;
      const newReferral: ReferralData = {
        userId: newUserId,
        date: new Date().toISOString(),
        status: 'PENDING',
        earnings: 0
      };
      
      if (!profile.referrals.some(r => r.userId === newUserId)) {
        profile.referrals.push(newReferral);
        await PersistenceService.saveUser(profile);
      }
    }
  },

  // --- Employees ---

  getEmployees: async (): Promise<EmployeeProfile[]> => {
    const { data } = await supabase.from('employees').select('*');
    if (!data) return [];
    
    return data.map((e: any) => ({
      ...e.data,
      id: e.id,
      email: e.email,
      role: e.role,
      passwordHash: e.password_hash,
      isActive: e.is_active
    }));
  },

  addEmployee: async (employee: EmployeeProfile): Promise<EmployeeProfile[]> => {
    await supabase.from('employees').upsert({
      id: employee.id,
      email: employee.email,
      role: employee.role,
      password_hash: employee.passwordHash,
      is_active: employee.isActive,
      data: employee
    });
    return PersistenceService.getEmployees();
  },

  updateEmployee: async (employee: EmployeeProfile): Promise<EmployeeProfile[]> => {
    await supabase.from('employees').upsert({
      id: employee.id,
      email: employee.email,
      role: employee.role,
      password_hash: employee.passwordHash,
      is_active: employee.isActive,
      data: employee
    });
    return PersistenceService.getEmployees();
  },

  // --- Internal Tickets ---

  getInternalTickets: async (): Promise<InternalTicket[]> => {
    const { data } = await supabase.from('internal_tickets').select('*').order('created_at', { ascending: false });
    return data ? data.map((r: any) => r.data) : [];
  },

  addInternalTicket: async (ticket: InternalTicket): Promise<InternalTicket[]> => {
    await supabase.from('internal_tickets').insert({
      id: ticket.id,
      status: ticket.status,
      data: ticket
    });

    try {
      await AdminNotificationClient.notify({
        category: 'ticket',
        subject: ticket.subject || 'New internal ticket',
        message: ticket.description || 'A new ticket was submitted.',
        metadata: {
          ticket_id: ticket.id,
          priority: ticket.priority,
          status: ticket.status,
          author_name: ticket.authorName,
        },
      });
    } catch (error) {
      console.warn('Admin ticket email notification failed', error);
    }

    return PersistenceService.getInternalTickets();
  },

  resolveInternalTicket: async (id: string): Promise<InternalTicket[]> => {
    const { data } = await supabase.from('internal_tickets').select('*').eq('id', id).single();
    if (data) {
      const ticket = data.data as InternalTicket;
      ticket.status = 'RESOLVED';
      await supabase.from('internal_tickets').update({
        status: 'RESOLVED',
        data: ticket
      }).eq('id', id);
    }
    return PersistenceService.getInternalTickets();
  },

  // --- Marketplace ---

  getAllRequests: async (): Promise<LoanRequest[]> => {
    const { data } = await supabase.from('loan_requests').select('*').order('created_at', { ascending: false });
    return data ? data.map((r: any) => r.data) : [];
  },

  saveRequest: async (req: LoanRequest) => {
    await supabase.from('loan_requests').upsert({
      id: req.id,
      borrower_id: req.borrowerId,
      status: req.status,
      amount: req.amount,
      data: req
    });
  },

  getAllOffers: async (): Promise<LoanOffer[]> => {
    const { data } = await supabase.from('loan_offers').select('*').order('created_at', { ascending: false });
    return data ? data.map((r: any) => r.data) : [];
  },

  saveOffer: async (offer: LoanOffer) => {
    await supabase.from('loan_offers').upsert({
      id: offer.id,
      lender_id: offer.lenderId,
      status: offer.status || 'ACTIVE',
      data: offer
    });
  },

  // --- Chat & Realtime ---

  getChatHistory: async (): Promise<ChatMessage[]> => {
    const { data, error } = await supabase.from('chats').select('*').limit(500);

    if (error) {
      throw new Error(`Failed to load chat history: ${error.message}`);
    }

    const parsed = (data || [])
      .map((row: any) => toChatMessage(row))
      .filter((msg): msg is ChatMessage => Boolean(msg))
      .sort((a, b) => a.timestamp - b.timestamp);

    if (parsed.length <= 200) return parsed;
    return parsed.slice(parsed.length - 200);
  },

  addChatMessage: async (msg: ChatMessage) => {
    const shouldNotifyChatRequest = msg.type === 'CUSTOMER_SUPPORT' && msg.role === 'CUSTOMER';
    let isFirstSupportMessage = false;

    if (shouldNotifyChatRequest && msg.threadId) {
      const { count } = await supabase
        .from('chats')
        .select('id', { count: 'exact', head: true })
        .eq('thread_id', msg.threadId)
        .eq('type', 'CUSTOMER_SUPPORT');
      isFirstSupportMessage = (count || 0) === 0;
    } else if (shouldNotifyChatRequest) {
      isFirstSupportMessage = true;
    }

    await supabase.from('chats').insert({
      id: msg.id,
      thread_id: msg.threadId,
      sender_id: msg.senderId,
      message: msg.message,
      type: msg.type,
      data: msg
    });

    if (shouldNotifyChatRequest && isFirstSupportMessage) {
      try {
        await AdminNotificationClient.notify({
          category: 'chat_request',
          subject: `New support chat request from ${msg.senderName || msg.senderId}`,
          message: truncate(msg.message || 'Customer requested support.', 800),
          metadata: {
            thread_id: msg.threadId || null,
            sender_id: msg.senderId,
            sender_name: msg.senderName,
          },
        });
      } catch (error) {
        console.warn('Admin chat notification failed', error);
      }
    }
  },

  // --- Disputes ---

  getAllDisputes: async (): Promise<Dispute[]> => {
    const { data } = await supabase.from('disputes').select('*');
    return data ? data.map((r: any) => r.data) : [];
  },

  saveDispute: async (dispute: Dispute) => {
    await supabase.from('disputes').upsert({
      id: dispute.id,
      status: dispute.status,
      data: dispute
    });
  },

  // --- Helpers ---
  
  processDeposit: async (user: UserProfile, amount: number): Promise<UserProfile> => {
    const updatedUser = { ...user, balance: user.balance + amount };
    await PersistenceService.saveUser(updatedUser);
    
    if (updatedUser.balance >= 100 && updatedUser.referredBy) {
      await PersistenceService.completeReferral(updatedUser.referredBy, updatedUser.id);
    }
    return updatedUser;
  },

  completeReferral: async (referrerId: string, refereeId: string) => {
    const { data } = await supabase.from('users').select('*').eq('id', referrerId).single();
    if (data) {
      const profile = data.data as UserProfile;
      const refIdx = profile.referrals.findIndex(r => r.userId === refereeId);
      if (refIdx !== -1 && profile.referrals[refIdx].status === 'PENDING') {
        profile.referrals[refIdx].status = 'COMPLETED';
        profile.referrals[refIdx].earnings = 5;
        profile.reputationScore = Math.min(100, profile.reputationScore + 5);
        await PersistenceService.saveUser(profile);
      }
    }
  },

  // Clear data (local only for session, cannot delete from DB via this button for safety)
  clearAll: (userId: string) => {
    localStorage.clear();
    window.location.reload();
  }
};
