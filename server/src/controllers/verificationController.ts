import { Request, Response, NextFunction } from 'express';
import { VerificationService } from '../services/verificationService';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGITS_ONLY = /\D+/g;

const isSelfOrPrivileged = (req: Request, targetUserId: string) => {
    const requesterId = req.auth?.userId;
    const roles = req.auth?.roles || [];

    return (
        requesterId === targetUserId ||
        roles.includes('admin') ||
        roles.includes('service_role') ||
        roles.includes('risk_officer')
    );
};

const toBoolean = (value: unknown) => {
    if (typeof value === 'boolean') return value;
    const normalized = String(value || '')
        .trim()
        .toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const normalizeUserIdInput = (value: unknown) => String(value || '').trim();
const normalizeSessionIdInput = (value: unknown) => String(value || '').trim();
const normalizeOptionalString = (value: unknown, maxLength: number = 256) => {
    const normalized = String(value || '').trim();
    if (!normalized) return undefined;
    return normalized.slice(0, maxLength);
};

const normalizeSsnLast4 = (value: unknown) => {
    const digits = String(value || '').replace(DIGITS_ONLY, '').slice(-4);
    return digits.length === 4 ? digits : undefined;
};

const normalizeAnnualSalary = (value: unknown) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return undefined;
    return Math.round(parsed);
};

export const VerificationController = {
    /**
     * POST /api/verification/hash
     * Validates a snapshot hash against the reputation engine.
     */
    verifyHash: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { snapshot_hash } = req.body;

            if (!snapshot_hash) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing snapshot_hash in request body.'
                });
            }

            const result = await VerificationService.verifySnapshotHash(snapshot_hash, req.accessToken);

            return res.status(200).json({
                success: true,
                data: {
                    is_valid: result.isValid,
                    is_chain_verified: result.isChainVerified,
                    snapshot_time: result.snapshotTime
                }
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * POST /api/verification/kyc
     */
    submitKYC: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = req.auth?.userId;
            const { requested_tier, provider, raw_response } = req.body || {};

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'Unauthenticated request.',
                });
            }

            if (typeof requested_tier !== 'number' || requested_tier < 0) {
                return res.status(400).json({
                    success: false,
                    error: 'requested_tier must be a non-negative number.',
                });
            }

            const updatedUser = await VerificationService.submitKYC(
                {
                    userId,
                    requestedTier: requested_tier,
                    provider,
                    rawResponse: raw_response,
                },
                req.accessToken
            );

            return res.status(200).json({
                success: true,
                data: updatedUser,
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * GET /api/verification/status/:userId
     */
    getStatus: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { userId } = req.params;

            if (!UUID_V4_REGEX.test(userId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid User ID format. UUID v4 expected.',
                });
            }

            if (!isSelfOrPrivileged(req, userId)) {
                return res.status(403).json({
                    success: false,
                    error: 'Forbidden: cannot access another user verification status.',
                });
            }

            const status = await VerificationService.getVerificationStatus(userId, req.accessToken);

            if (!status) {
                return res.status(404).json({
                    success: false,
                    error: 'Verification status not found for this user.',
                });
            }

            return res.status(200).json({
                success: true,
                data: status,
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * POST /api/verification/attestation
     */
    createAttestation: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const actorId = req.auth?.userId;
            const { user_id, snapshot_hash, note } = req.body || {};

            if (!actorId) {
                return res.status(401).json({
                    success: false,
                    error: 'Unauthenticated request.',
                });
            }

            if (!user_id || !UUID_V4_REGEX.test(user_id)) {
                return res.status(400).json({
                    success: false,
                    error: 'user_id must be a valid UUID v4.',
                });
            }

            if (!isSelfOrPrivileged(req, user_id)) {
                return res.status(403).json({
                    success: false,
                    error: 'Forbidden: cannot attest snapshot for another user.',
                });
            }

            if (!snapshot_hash || typeof snapshot_hash !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: 'snapshot_hash must be provided.',
                });
            }

            const attestation = await VerificationService.createAttestation(
                {
                    actorId,
                    userId: user_id,
                    snapshotHash: snapshot_hash,
                    note,
                },
                req.accessToken
            );

            return res.status(201).json({
                success: true,
                data: attestation,
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * POST /api/verification/stripe/session
     * Creates a Stripe Identity verification session and returns hosted URL/client_secret.
     */
    createStripeIdentitySession: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const authenticatedUserId = req.auth?.userId || '';
            const userId = normalizeUserIdInput(req.body?.userId) || authenticatedUserId;

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'userId is required.',
                });
            }

            if (authenticatedUserId && authenticatedUserId !== userId && !isSelfOrPrivileged(req, userId)) {
                return res.status(403).json({
                    success: false,
                    error: 'Forbidden: cannot create verification session for another user.',
                });
            }

            const session = await VerificationService.createStripeIdentitySession({
                userId,
                userEmail: normalizeOptionalString(req.body?.userEmail, 200),
                userPhone: normalizeOptionalString(req.body?.userPhone, 50),
                requestedTier: req.body?.requestedTier,
                returnUrl: normalizeOptionalString(req.body?.returnUrl, 2048),
                complianceProfile: {
                    firstName: normalizeOptionalString(req.body?.firstName, 120),
                    lastName: normalizeOptionalString(req.body?.lastName, 120),
                    dob: normalizeOptionalString(req.body?.dob, 40),
                    address: normalizeOptionalString(req.body?.address, 400),
                    phone: normalizeOptionalString(req.body?.phone, 50),
                    email: normalizeOptionalString(req.body?.email, 200),
                    ssnLast4: normalizeSsnLast4(req.body?.ssnLast4 || req.body?.ssn),
                    annualSalaryUsd: normalizeAnnualSalary(
                        req.body?.annualSalaryUsd ?? req.body?.annualSalary ?? req.body?.income
                    ),
                },
            });

            return res.status(200).json({
                success: true,
                data: session,
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * GET /api/verification/stripe/session/:sessionId
     */
    getStripeIdentitySessionStatus: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const sessionId = normalizeSessionIdInput(req.params?.sessionId);
            if (!sessionId) {
                return res.status(400).json({
                    success: false,
                    error: 'sessionId is required.',
                });
            }

            const authenticatedUserId = req.auth?.userId || '';
            const userId = normalizeUserIdInput(req.query?.userId) || authenticatedUserId;
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'userId is required.',
                });
            }

            if (authenticatedUserId && authenticatedUserId !== userId && !isSelfOrPrivileged(req, userId)) {
                return res.status(403).json({
                    success: false,
                    error: 'Forbidden: cannot access another user verification session.',
                });
            }

            const status = await VerificationService.getStripeIdentitySessionStatus({
                sessionId,
                requesterUserId: userId,
                targetUserId: userId,
                isPrivileged: false,
                refreshFromStripe: toBoolean(req.query?.refresh),
            });

            if (!status) {
                return res.status(404).json({
                    success: false,
                    error: 'Stripe identity session not found.',
                });
            }

            return res.status(200).json({
                success: true,
                data: status,
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * GET /api/verification/stripe/sessions
     */
    listStripeIdentitySessions: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const authenticatedUserId = req.auth?.userId || '';
            const userId = normalizeUserIdInput(req.query?.userId) || authenticatedUserId;
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'userId is required.',
                });
            }

            if (authenticatedUserId && authenticatedUserId !== userId && !isSelfOrPrivileged(req, userId)) {
                return res.status(403).json({
                    success: false,
                    error: 'Forbidden: cannot access another user verification sessions.',
                });
            }

            const sessions = await VerificationService.listStripeIdentitySessions({
                requesterUserId: userId,
                targetUserId: userId,
                isPrivileged: false,
                limit: Number(req.query?.limit || 10),
            });

            return res.status(200).json({
                success: true,
                data: sessions,
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * POST /api/verification/stripe/webhook
     */
    handleStripeIdentityWebhook: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const signature = String(req.header('stripe-signature') || '').trim();
            if (!signature) {
                return res.status(400).json({
                    received: false,
                    error: 'Missing Stripe signature header.',
                });
            }

            const rawBody =
                Buffer.isBuffer(req.body)
                    ? req.body
                    : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));

            const result = await VerificationService.handleStripeIdentityWebhook({
                rawBody,
                signature,
            });

            return res.status(200).json({
                received: true,
                ...result,
            });
        } catch (error) {
            next(error);
        }
    },
};
