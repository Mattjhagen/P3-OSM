import Stripe from 'stripe';
import { config } from '../config/config';
import { supabase } from '../config/supabase';
import logger from '../utils/logger';
import { AdminNotificationService } from './adminNotificationService';
import { getDbClient } from './dbClient';

const STRIPE_API_VERSION = '2023-10-16' as any;
const DEFAULT_IDENTITY_RETURN_PATH = '/profile?kyc=stripe-return';
const SUPPORTED_DOC_TYPES = new Set(['passport', 'id_card', 'driving_license']);
const NON_DIGIT_REGEX = /\D+/g;

type KycStatusLabel = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';

type StripeIdentityStatus =
  | 'created'
  | 'processing'
  | 'requires_input'
  | 'verified'
  | 'canceled'
  | 'redacted';

type KycComplianceProfile = {
  firstName?: string;
  lastName?: string;
  dob?: string;
  address?: string;
  phone?: string;
  email?: string;
  ssnLast4?: string;
  annualSalaryUsd?: number;
};

const KYC_TIER_LABEL_BY_NUMBER: Record<number, string> = {
  0: 'Tier 0 (Unverified)',
  1: 'Tier 1 (Basic)',
  2: 'Tier 2 (Verified)',
  3: 'Tier 3 (Enhanced)',
};

const KYC_LIMIT_BY_TIER: Record<number, number> = {
  0: 0,
  1: 1000,
  2: 50000,
  3: 1000000,
};

let stripeClient: Stripe | null = null;

const getStripeClient = () => {
  if (!config.stripe.secretKey) {
    return null;
  }

  if (!stripeClient) {
    stripeClient = new Stripe(config.stripe.secretKey, {
      apiVersion: STRIPE_API_VERSION,
    });
  }

  return stripeClient;
};

const isMissingTableError = (message: string, tableName: string) => {
  const normalized = (message || '').toLowerCase();
  return (
    normalized.includes(`could not find the table 'public.${tableName}'`) ||
    normalized.includes(`relation \"${tableName}\" does not exist`) ||
    (normalized.includes(tableName.toLowerCase()) && normalized.includes('schema cache'))
  );
};

const isMissingColumnError = (message: string, columnName: string) => {
  const normalized = (message || '').toLowerCase();
  return (
    normalized.includes(`column \"${columnName.toLowerCase()}\" does not exist`) ||
    (normalized.includes(columnName.toLowerCase()) && normalized.includes('does not exist'))
  );
};

const normalizeRequestedTier = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 2;
  const normalized = Math.floor(parsed);
  if (normalized < 1) return 1;
  if (normalized > 3) return 3;
  return normalized;
};

const normalizeOptionalText = (value: unknown, maxLength = 255) => {
  const normalized = String(value || '').trim();
  if (!normalized) return undefined;
  return normalized.slice(0, maxLength);
};

const normalizeSsnLast4 = (value: unknown) => {
  const digits = String(value || '').replace(NON_DIGIT_REGEX, '').slice(-4);
  return digits.length === 4 ? digits : undefined;
};

const normalizeAnnualSalary = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.round(parsed);
};

const normalizeReturnUrl = (value: unknown) => {
  const raw = String(value || '').trim();
  if (raw) return raw;
  const base = String(config.frontendUrl || 'https://p3lending.space').replace(/\/+$/, '');
  return `${base}${DEFAULT_IDENTITY_RETURN_PATH}`;
};

const normalizeIdentityStatus = (value: unknown): StripeIdentityStatus => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();

  if (normalized === 'processing') return 'processing';
  if (normalized === 'requires_input') return 'requires_input';
  if (normalized === 'verified') return 'verified';
  if (normalized === 'canceled') return 'canceled';
  if (normalized === 'redacted') return 'redacted';
  return 'created';
};

const resolveAllowedDocumentTypes = () => {
  const configured = (config.stripe.identity.allowedDocTypes || [])
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .filter((entry) => SUPPORTED_DOC_TYPES.has(entry));

  if (configured.length > 0) {
    return configured as Array<'passport' | 'id_card' | 'driving_license'>;
  }

  return ['passport', 'id_card', 'driving_license'] as Array<'passport' | 'id_card' | 'driving_license'>;
};

const calculateAge = (dob?: {
  day?: number | null;
  month?: number | null;
  year?: number | null;
}) => {
  if (!dob?.year || !dob?.month || !dob?.day) return null;

  const birthDate = new Date(Date.UTC(dob.year, dob.month - 1, dob.day));
  if (Number.isNaN(birthDate.getTime())) return null;

  const now = new Date();
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birthDate.getUTCMonth();

  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birthDate.getUTCDate())) {
    age -= 1;
  }

  return age;
};

const evaluateAmlRisk = (session: Stripe.Identity.VerificationSession) => {
  let riskScore = 0;
  const reasons: string[] = [];
  const status = normalizeIdentityStatus(session.status);
  const country = String(session.verified_outputs?.address?.country || '')
    .trim()
    .toUpperCase();
  const lastErrorCode = String(session.last_error?.code || '').trim();

  if (status === 'requires_input' || status === 'canceled') {
    riskScore += 65;
    reasons.push(`Stripe Identity status is ${status}.`);
  }

  if (lastErrorCode) {
    riskScore += 45;
    reasons.push(`Stripe last_error code: ${lastErrorCode}.`);
  }

  if (country && country !== 'US') {
    riskScore += 30;
    reasons.push(`Verified country ${country} requires jurisdiction review.`);
  }

  const age = calculateAge(session.verified_outputs?.dob as any);
  if (typeof age === 'number' && age < 18) {
    riskScore = 100;
    reasons.push('Verified DOB indicates under-18 applicant.');
  }

  riskScore = Math.max(0, Math.min(100, riskScore));

  const requiresManualReview =
    status !== 'verified' ||
    riskScore >= 60 ||
    (typeof age === 'number' && age < 18);

  return {
    riskScore,
    reasons,
    requiresManualReview,
  };
};

const deriveKycStatus = (
  sessionStatus: StripeIdentityStatus,
  requiresManualReview: boolean
): KycStatusLabel => {
  if (sessionStatus === 'verified' && !requiresManualReview) return 'VERIFIED';
  if (sessionStatus === 'canceled') return 'REJECTED';
  if (sessionStatus === 'requires_input') return 'PENDING';
  if (sessionStatus === 'processing') return 'PENDING';
  return 'PENDING';
};

const upsertStripeIdentitySession = async (payload: {
  userId: string;
  session: Stripe.Identity.VerificationSession;
  requestedTier: number;
  status: StripeIdentityStatus;
  requiresManualReview: boolean;
  riskScore: number;
  riskReasons: string[];
  returnUrl?: string;
}) => {
  const row = {
    user_id: payload.userId,
    stripe_session_id: payload.session.id,
    client_reference_id: payload.session.client_reference_id || payload.userId,
    requested_tier: payload.requestedTier,
    status: payload.status,
    requires_manual_review: payload.requiresManualReview,
    aml_risk_score: payload.riskScore,
    aml_notes: payload.riskReasons.join(' | ') || null,
    last_error_code: payload.session.last_error?.code || null,
    last_error_reason: payload.session.last_error?.reason || null,
    return_url: payload.returnUrl || null,
    verification_url: payload.session.url || null,
    verified_at: payload.status === 'verified' ? new Date().toISOString() : null,
    provider: 'stripe_identity',
    raw_session: payload.session as unknown as Record<string, unknown>,
  };

  const { error } = await supabase
    .from('stripe_identity_sessions')
    .upsert(row, { onConflict: 'stripe_session_id' });

  if (error) {
    if (isMissingTableError(error.message, 'stripe_identity_sessions')) {
      await supabase.from('audit_log').insert({
        actor_id: payload.userId,
        action: 'stripe_identity_session_fallback',
        resource_type: 'stripe_identity_sessions',
        metadata: row,
      });
      return;
    }

    throw new Error(`Failed to persist Stripe identity session: ${error.message}`);
  }
};

const persistKycIntakeProfile = async (payload: {
  userId: string;
  requestedTier: number;
  profile?: KycComplianceProfile;
}) => {
  const profile = payload.profile || {};
  const normalizedProfile = {
    firstName: normalizeOptionalText(profile.firstName, 120),
    lastName: normalizeOptionalText(profile.lastName, 120),
    dob: normalizeOptionalText(profile.dob, 30),
    address: normalizeOptionalText(profile.address, 400),
    phone: normalizeOptionalText(profile.phone, 40),
    email: normalizeOptionalText(profile.email, 200),
    ssnLast4: normalizeSsnLast4(profile.ssnLast4),
    annualSalaryUsd: normalizeAnnualSalary(profile.annualSalaryUsd),
  };

  const hasProfileData = Object.values(normalizedProfile).some(
    (value) => value !== undefined && value !== ''
  );
  if (!hasProfileData) {
    return;
  }

  const { data: userRow, error: userFetchError } = await supabase
    .from('users')
    .select('id, email, data')
    .eq('id', payload.userId)
    .maybeSingle();

  if (userFetchError) {
    logger.warn(
      { userId: payload.userId, error: userFetchError.message },
      'Unable to load users row for KYC intake profile persistence'
    );
    return;
  }

  if (!userRow) return;

  const existingData =
    userRow.data && typeof userRow.data === 'object'
      ? (userRow.data as Record<string, unknown>)
      : {};
  const existingKycProfile =
    existingData.kycProfile && typeof existingData.kycProfile === 'object'
      ? (existingData.kycProfile as Record<string, unknown>)
      : {};

  const mergedKycProfile: Record<string, unknown> = {
    ...existingKycProfile,
    requestedTier: payload.requestedTier,
    submittedAt: new Date().toISOString(),
  };

  if (normalizedProfile.firstName) mergedKycProfile.firstName = normalizedProfile.firstName;
  if (normalizedProfile.lastName) mergedKycProfile.lastName = normalizedProfile.lastName;
  if (normalizedProfile.dob) mergedKycProfile.dob = normalizedProfile.dob;
  if (normalizedProfile.address) mergedKycProfile.address = normalizedProfile.address;
  if (normalizedProfile.phone) mergedKycProfile.phone = normalizedProfile.phone;
  if (normalizedProfile.email) mergedKycProfile.email = normalizedProfile.email;
  if (normalizedProfile.ssnLast4) mergedKycProfile.ssnLast4 = normalizedProfile.ssnLast4;
  if (typeof normalizedProfile.annualSalaryUsd === 'number') {
    mergedKycProfile.annualSalaryUsd = normalizedProfile.annualSalaryUsd;
  }

  const updatePayload: Record<string, unknown> = {
    data: {
      ...existingData,
      kycProfile: mergedKycProfile,
    },
  };

  if (normalizedProfile.email && normalizedProfile.email !== userRow.email) {
    updatePayload.email = normalizedProfile.email;
  }

  const { error: updateError } = await supabase
    .from('users')
    .update(updatePayload)
    .eq('id', payload.userId);

  if (updateError) {
    logger.warn(
      { userId: payload.userId, error: updateError.message },
      'Unable to persist KYC intake profile in users.data'
    );
    return;
  }

  const { error: auditError } = await supabase.from('audit_log').insert({
    actor_id: payload.userId,
    action: 'kyc_intake_profile_saved',
    resource_type: 'users',
    resource_id: payload.userId,
    metadata: {
      requested_tier: payload.requestedTier,
      has_name: Boolean(normalizedProfile.firstName || normalizedProfile.lastName),
      has_dob: Boolean(normalizedProfile.dob),
      has_address: Boolean(normalizedProfile.address),
      has_phone: Boolean(normalizedProfile.phone),
      has_email: Boolean(normalizedProfile.email),
      has_ssn_last4: Boolean(normalizedProfile.ssnLast4),
      annual_salary_usd: normalizedProfile.annualSalaryUsd ?? null,
    },
  });

  if (auditError) {
    logger.warn(
      { userId: payload.userId, error: auditError.message },
      'Unable to write KYC intake profile audit log'
    );
  }
};

const updateUserKycProjection = async (payload: {
  userId: string;
  requestedTier: number;
  kycStatus: KycStatusLabel;
  requiresManualReview: boolean;
  status: StripeIdentityStatus;
  notes: string[];
}) => {
  const nowIso = new Date().toISOString();

  const structuredUpdate: Record<string, unknown> = {
    updated_at: nowIso,
  };

  if (payload.kycStatus === 'VERIFIED' && !payload.requiresManualReview) {
    structuredUpdate.kyc_tier = payload.requestedTier;
  }

  if (payload.kycStatus === 'REJECTED') {
    structuredUpdate.default_flag = false;
  }

  const { error: structuredError } = await supabase
    .from('users')
    .update(structuredUpdate)
    .eq('id', payload.userId);

  if (
    structuredError &&
    !isMissingColumnError(structuredError.message, 'kyc_tier') &&
    !isMissingColumnError(structuredError.message, 'updated_at') &&
    !isMissingColumnError(structuredError.message, 'default_flag')
  ) {
    logger.warn(
      { userId: payload.userId, error: structuredError.message },
      'Structured users table KYC update failed'
    );
  }

  const { data: userRow, error: userRowError } = await supabase
    .from('users')
    .select('id, data')
    .eq('id', payload.userId)
    .maybeSingle();

  if (userRowError) {
    logger.warn(
      { userId: payload.userId, error: userRowError.message },
      'Unable to load users.data for Stripe Identity sync'
    );
    return;
  }

  if (!userRow) return;

  const existingData =
    userRow.data && typeof userRow.data === 'object'
      ? (userRow.data as Record<string, unknown>)
      : {};

  const mergedData: Record<string, unknown> = {
    ...existingData,
    kycStatus: payload.kycStatus,
    accountStatus:
      payload.kycStatus === 'REJECTED'
        ? 'SUSPENDED'
        : payload.kycStatus === 'VERIFIED'
        ? 'ACTIVE'
        : existingData.accountStatus || 'ACTIVE',
    adminNotes:
      payload.notes.length > 0
        ? payload.notes.join(' | ')
        : existingData.adminNotes || null,
  };

  if (payload.kycStatus === 'VERIFIED' && !payload.requiresManualReview) {
    mergedData.kycTier = KYC_TIER_LABEL_BY_NUMBER[payload.requestedTier] || KYC_TIER_LABEL_BY_NUMBER[2];
    mergedData.kycLimit = KYC_LIMIT_BY_TIER[payload.requestedTier] || KYC_LIMIT_BY_TIER[2];
  }

  if (payload.kycStatus !== 'VERIFIED') {
    const existingTier = Number(existingData.kycTier || 0);
    if (!Number.isFinite(existingTier) || existingTier <= 0) {
      mergedData.kycTier = KYC_TIER_LABEL_BY_NUMBER[1];
      mergedData.kycLimit = KYC_LIMIT_BY_TIER[1];
    }
  }

  const { error: profileError } = await supabase
    .from('users')
    .update({ data: mergedData })
    .eq('id', payload.userId);

  if (profileError) {
    logger.warn(
      { userId: payload.userId, error: profileError.message },
      'Unable to update users.data profile KYC projection'
    );
  }
};

const maybeNotifyManualReview = async (payload: {
  userId: string;
  session: Stripe.Identity.VerificationSession;
  requestedTier: number;
  riskScore: number;
  riskReasons: string[];
  status: StripeIdentityStatus;
  requiresManualReview: boolean;
}) => {
  if (!payload.requiresManualReview) return;

  const subject = `Stripe Identity manual review: ${payload.session.id}`;
  const message = [
    `Stripe Identity session requires review.`,
    `Session: ${payload.session.id}`,
    `User: ${payload.userId}`,
    `Requested tier: ${payload.requestedTier}`,
    `Status: ${payload.status}`,
    `Risk score: ${payload.riskScore}`,
    payload.riskReasons.length > 0 ? `Reasons:\n- ${payload.riskReasons.join('\n- ')}` : 'Reasons: none',
  ].join('\n');

  await AdminNotificationService.notify({
    category: payload.riskScore >= 70 ? 'risk_alert' : 'manual_review',
    subject,
    message,
    userId: payload.userId,
    userEmail: payload.session.verified_outputs?.email || null,
    metadata: {
      stripe_session_id: payload.session.id,
      stripe_status: payload.status,
      requested_tier: payload.requestedTier,
      aml_risk_score: payload.riskScore,
      aml_reasons: payload.riskReasons,
    },
  });
};

const processStripeIdentitySession = async (payload: {
  session: Stripe.Identity.VerificationSession;
  source: 'webhook' | 'create' | 'refresh';
  eventId?: string;
  returnUrl?: string;
}) => {
  const session = payload.session;
  const userId = String(session.metadata?.userId || session.client_reference_id || '').trim();

  if (!userId) {
    logger.warn(
      { sessionId: session.id, source: payload.source },
      'Stripe Identity session missing user identity linkage in metadata/client_reference_id'
    );
    return {
      handled: false,
      reason: 'missing_user_id',
    };
  }

  const requestedTier = normalizeRequestedTier(session.metadata?.requestedTier);
  const status = normalizeIdentityStatus(session.status);
  const risk = evaluateAmlRisk(session);
  const kycStatus = deriveKycStatus(status, risk.requiresManualReview);

  const { data: prior } = await supabase
    .from('stripe_identity_sessions')
    .select('requires_manual_review, status')
    .eq('stripe_session_id', session.id)
    .maybeSingle();

  await upsertStripeIdentitySession({
    userId,
    session,
    requestedTier,
    status,
    requiresManualReview: risk.requiresManualReview,
    riskScore: risk.riskScore,
    riskReasons: risk.reasons,
    returnUrl: payload.returnUrl,
  });

  await updateUserKycProjection({
    userId,
    requestedTier,
    kycStatus,
    requiresManualReview: risk.requiresManualReview,
    status,
    notes: risk.reasons,
  });

  const shouldNotify =
    risk.requiresManualReview &&
    (!prior || !prior.requires_manual_review || String(prior.status || '') !== status);

  if (shouldNotify) {
    await maybeNotifyManualReview({
      userId,
      session,
      requestedTier,
      riskScore: risk.riskScore,
      riskReasons: risk.reasons,
      status,
      requiresManualReview: risk.requiresManualReview,
    });
  }

  await supabase.from('audit_log').insert({
    actor_id: userId,
    action: 'stripe_identity_session_update',
    resource_type: 'stripe_identity_sessions',
    resource_id: session.id,
    metadata: {
      source: payload.source,
      event_id: payload.eventId || null,
      stripe_session_id: session.id,
      stripe_status: status,
      requested_tier: requestedTier,
      kyc_status: kycStatus,
      requires_manual_review: risk.requiresManualReview,
      aml_risk_score: risk.riskScore,
      aml_reasons: risk.reasons,
    },
  });

  return {
    handled: true,
    userId,
    sessionId: session.id,
    status,
    requestedTier,
    kycStatus,
    requiresManualReview: risk.requiresManualReview,
    amlRiskScore: risk.riskScore,
    amlReasons: risk.reasons,
  };
};

export const VerificationService = {
  isStripeIdentityConfigured: () =>
    Boolean(config.stripe.identity.enabled && config.stripe.secretKey && config.stripe.webhookSecret),

  /**
   * Verifies if a snapshot hash corresponds to a valid trust score snapshot.
   * @param hash The feature_vector_hash to verify
   */
  verifySnapshotHash: async (hash: string, accessToken?: string) => {
    const client = getDbClient(accessToken);

    const { data, error } = await client
      .from('trust_score_snapshots')
      .select('snapshot_time')
      .eq('feature_vector_hash', hash)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Database error during verification: ${error.message}`);
    }

    return {
      isValid: !!data,
      snapshotTime: data ? data.snapshot_time : null,
      isChainVerified: false,
    };
  },

  submitKYC: async (
    payload: {
      userId: string;
      requestedTier: number;
      provider?: string;
      rawResponse?: Record<string, unknown>;
    },
    accessToken?: string
  ) => {
    const client = getDbClient(accessToken);

    const { data: updatedUser, error: updateError } = await client
      .from('users')
      .update({
        kyc_tier: payload.requestedTier,
        updated_at: new Date().toISOString(),
      })
      .eq('id', payload.userId)
      .select('id, wallet_address, kyc_tier, created_at, updated_at')
      .single();

    if (updateError) {
      throw new Error(`Failed to update KYC tier: ${updateError.message}`);
    }

    const { error: auditError } = await client
      .from('audit_log')
      .insert({
        actor_id: payload.userId,
        action: 'kyc_submission',
        resource_type: 'users',
        resource_id: payload.userId,
        metadata: {
          provider: payload.provider || 'manual',
          requested_tier: payload.requestedTier,
          raw_response: payload.rawResponse || null,
        },
      });

    if (auditError) {
      throw new Error(`Failed to write KYC audit log: ${auditError.message}`);
    }

    return updatedUser;
  },

  async createStripeIdentitySession(payload: {
    userId: string;
    userEmail?: string | null;
    userPhone?: string | null;
    requestedTier?: number;
    returnUrl?: string;
    complianceProfile?: KycComplianceProfile;
  }) {
    if (!config.stripe.identity.enabled) {
      const error = new Error('Stripe Identity is disabled. Set STRIPE_IDENTITY_ENABLED=true.') as Error & {
        status?: number;
      };
      error.status = 503;
      throw error;
    }

    const stripe = getStripeClient();
    if (!stripe) {
      const error = new Error('Stripe is not configured. Set STRIPE_SECRET_KEY before creating Identity sessions.') as Error & {
        status?: number;
      };
      error.status = 503;
      throw error;
    }

    const requestedTier = normalizeRequestedTier(payload.requestedTier);
    const returnUrl = normalizeReturnUrl(payload.returnUrl);
    const verificationFlowId = String(config.stripe.identity.verificationFlowId || '').trim();

    await persistKycIntakeProfile({
      userId: payload.userId,
      requestedTier,
      profile: payload.complianceProfile,
    });

    const providedEmail =
      normalizeOptionalText(payload.userEmail, 200) ||
      normalizeOptionalText(payload.complianceProfile?.email, 200);
    const providedPhone =
      normalizeOptionalText(payload.userPhone, 40) ||
      normalizeOptionalText(payload.complianceProfile?.phone, 40);

    const createParams: Stripe.Identity.VerificationSessionCreateParams = {
      client_reference_id: payload.userId,
      return_url: returnUrl,
      metadata: {
        flow: 'kyc_aml',
        userId: payload.userId,
        requestedTier: String(requestedTier),
      },
    };

    if (providedEmail || providedPhone) {
      createParams.provided_details = {
        ...(providedEmail ? { email: providedEmail } : {}),
        ...(providedPhone ? { phone: providedPhone } : {}),
      };
    }

    if (verificationFlowId) {
      createParams.verification_flow = verificationFlowId;
    } else {
      createParams.type = 'document';
      createParams.options = {
        document: {
          allowed_types: resolveAllowedDocumentTypes(),
          require_live_capture: Boolean(config.stripe.identity.requireLiveCapture),
          require_matching_selfie: Boolean(config.stripe.identity.requireMatchingSelfie),
          require_id_number: Boolean(config.stripe.identity.requireIdNumber),
        },
      };
    }

    const session = await stripe.identity.verificationSessions.create(createParams);

    await processStripeIdentitySession({
      session,
      source: 'create',
      returnUrl,
    });

    return {
      sessionId: session.id,
      clientSecret: session.client_secret,
      url: session.url,
      status: session.status,
      requestedTier,
      returnUrl,
    };
  },

  async refreshStripeIdentitySession(sessionId: string) {
    if (!config.stripe.identity.enabled) {
      const error = new Error('Stripe Identity is disabled. Set STRIPE_IDENTITY_ENABLED=true.') as Error & {
        status?: number;
      };
      error.status = 503;
      throw error;
    }

    const stripe = getStripeClient();
    if (!stripe) {
      const error = new Error('Stripe is not configured. Set STRIPE_SECRET_KEY before refreshing Identity sessions.') as Error & {
        status?: number;
      };
      error.status = 503;
      throw error;
    }

    const session = await stripe.identity.verificationSessions.retrieve(sessionId);
    const processed = await processStripeIdentitySession({
      session,
      source: 'refresh',
    });

    return {
      session,
      processed,
    };
  },

  async getStripeIdentitySessionStatus(payload: {
    sessionId: string;
    requesterUserId: string;
    targetUserId?: string;
    isPrivileged?: boolean;
    refreshFromStripe?: boolean;
  }) {
    const normalizedSessionId = String(payload.sessionId || '').trim();
    if (!normalizedSessionId) {
      throw new Error('sessionId is required.');
    }

    if (payload.refreshFromStripe) {
      await this.refreshStripeIdentitySession(normalizedSessionId);
    }

    const targetUserId =
      payload.isPrivileged && payload.targetUserId
        ? String(payload.targetUserId).trim()
        : payload.requesterUserId;

    let query = supabase
      .from('stripe_identity_sessions')
      .select(
        'stripe_session_id, user_id, status, requested_tier, requires_manual_review, aml_risk_score, aml_notes, last_error_code, last_error_reason, verified_at, verification_url, created_at, updated_at'
      )
      .eq('stripe_session_id', normalizedSessionId);

    if (!payload.isPrivileged) {
      query = query.eq('user_id', targetUserId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      if (isMissingTableError(error.message, 'stripe_identity_sessions')) {
        return null;
      }

      throw new Error(`Failed to fetch Stripe identity session status: ${error.message}`);
    }

    if (!data) return null;

    return {
      sessionId: data.stripe_session_id,
      userId: data.user_id,
      status: data.status,
      requestedTier: data.requested_tier,
      requiresManualReview: data.requires_manual_review,
      amlRiskScore: data.aml_risk_score,
      amlNotes: data.aml_notes,
      lastErrorCode: data.last_error_code,
      lastErrorReason: data.last_error_reason,
      verifiedAt: data.verified_at,
      verificationUrl: data.verification_url,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  },

  async listStripeIdentitySessions(payload: {
    requesterUserId: string;
    targetUserId?: string;
    isPrivileged?: boolean;
    limit?: number;
  }) {
    const targetUserId =
      payload.isPrivileged && payload.targetUserId
        ? String(payload.targetUserId).trim()
        : payload.requesterUserId;

    const normalizedLimit = Math.max(1, Math.min(100, Number(payload.limit || 10)));

    let query = supabase
      .from('stripe_identity_sessions')
      .select(
        'stripe_session_id, user_id, status, requested_tier, requires_manual_review, aml_risk_score, aml_notes, last_error_code, last_error_reason, verified_at, verification_url, created_at, updated_at'
      )
      .order('created_at', { ascending: false })
      .limit(normalizedLimit);

    if (!payload.isPrivileged) {
      query = query.eq('user_id', targetUserId);
    }

    const { data, error } = await query;

    if (error) {
      if (isMissingTableError(error.message, 'stripe_identity_sessions')) {
        return [];
      }

      throw new Error(`Failed to list Stripe identity sessions: ${error.message}`);
    }

    return (data || []).map((row: any) => ({
      sessionId: row.stripe_session_id,
      userId: row.user_id,
      status: row.status,
      requestedTier: row.requested_tier,
      requiresManualReview: row.requires_manual_review,
      amlRiskScore: row.aml_risk_score,
      amlNotes: row.aml_notes,
      lastErrorCode: row.last_error_code,
      lastErrorReason: row.last_error_reason,
      verifiedAt: row.verified_at,
      verificationUrl: row.verification_url,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  },

  async handleStripeIdentityWebhook(payload: { rawBody: Buffer; signature: string }) {
    const stripe = getStripeClient();
    if (!stripe || !config.stripe.webhookSecret) {
      const error = new Error('Stripe webhook is not configured on the server.') as Error & {
        status?: number;
      };
      error.status = 503;
      throw error;
    }

    const event = stripe.webhooks.constructEvent(
      payload.rawBody,
      payload.signature,
      config.stripe.webhookSecret
    );

    if (
      event.type === 'identity.verification_session.verified' ||
      event.type === 'identity.verification_session.requires_input' ||
      event.type === 'identity.verification_session.processing' ||
      event.type === 'identity.verification_session.canceled' ||
      event.type === 'identity.verification_session.redacted'
    ) {
      const session = event.data.object as Stripe.Identity.VerificationSession;
      await processStripeIdentitySession({
        session,
        source: 'webhook',
        eventId: event.id,
      });

      return {
        handled: true,
        eventType: event.type,
        sessionId: session.id,
      };
    }

    return {
      handled: false,
      eventType: event.type,
    };
  },

  getVerificationStatus: async (userId: string, accessToken?: string) => {
    const client = getDbClient(accessToken);

    const { data: userData, error: userError } = await client
      .from('users')
      .select('id, kyc_tier, updated_at')
      .eq('id', userId)
      .maybeSingle();

    if (userError) {
      throw new Error(`Failed to fetch verification status: ${userError.message}`);
    }

    if (!userData) {
      return null;
    }

    const { data: latestSnapshot, error: snapshotError } = await client
      .from('trust_score_snapshots')
      .select('score, risk_tier, snapshot_time, model_version')
      .eq('user_id', userId)
      .order('snapshot_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (snapshotError) {
      throw new Error(`Failed to fetch trust snapshot status: ${snapshotError.message}`);
    }

    return {
      user_id: userData.id,
      kyc_tier: userData.kyc_tier,
      status_updated_at: userData.updated_at,
      latest_trust_snapshot: latestSnapshot,
    };
  },

  createAttestation: async (
    payload: {
      actorId: string;
      userId: string;
      snapshotHash: string;
      note?: string;
    },
    accessToken?: string
  ) => {
    const client = getDbClient(accessToken);

    const attestationRef = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const { error } = await client
      .from('audit_log')
      .insert({
        actor_id: payload.actorId,
        action: 'snapshot_attestation_anchor',
        resource_type: 'trust_score_snapshots',
        resource_id: payload.userId,
        metadata: {
          attestation_reference: attestationRef,
          snapshot_hash: payload.snapshotHash,
          note: payload.note || null,
        },
      });

    if (error) {
      throw new Error(`Failed to create attestation audit record: ${error.message}`);
    }

    return {
      attestation_reference: attestationRef,
      snapshot_hash: payload.snapshotHash,
      anchored_at: new Date().toISOString(),
    };
  },
};
