import { NextFunction, Request, Response } from 'express';
import { AdminService } from '../services/adminService';
import {
    WaitlistAdminError,
    WaitlistAdminService,
} from '../services/waitlistAdminService';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const asString = (value: unknown) => String(value || '').trim();

const resolveWaitlistErrorStatus = (error: unknown) => {
    if (error instanceof WaitlistAdminError) {
        return error.status;
    }
    if (typeof (error as any)?.status === 'number') {
        return (error as any).status;
    }
    return 500;
};

const resolveWaitlistErrorMessage = (error: unknown) => {
    if (error instanceof Error) return error.message;
    return 'Unexpected waitlist admin error.';
};

export const AdminController = {
    /**
     * GET /api/admin/waitlist
     */
    getWaitlist: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const adminEmail =
                asString(req.query.adminEmail) ||
                asString(req.header('x-admin-email')) ||
                asString(req.auth?.email);

            const pageRaw = Number(req.query.page || 1);
            const pageSizeRaw = Number(req.query.pageSize || req.query.limit || 200);
            const page = Number.isFinite(pageRaw) ? pageRaw : 1;
            const pageSize = Number.isFinite(pageSizeRaw) ? pageSizeRaw : 200;

            const result = await WaitlistAdminService.getWaitlistQueue({
                adminEmail,
                authorizationHeader: req.header('authorization') || '',
                page,
                pageSize,
            });

            return res.status(200).json({
                success: true,
                data: result.rows,
                meta: {
                    total: result.total,
                    page: result.page,
                    pageSize: result.pageSize,
                },
            });
        } catch (error) {
            const status = resolveWaitlistErrorStatus(error);
            if (status >= 500) {
                return next(error);
            }
            return res.status(status).json({
                success: false,
                error: resolveWaitlistErrorMessage(error),
            });
        }
    },

    /**
     * POST /api/admin/waitlist/invite
     */
    inviteWaitlist: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const adminEmail =
                asString(req.body?.adminEmail) ||
                asString(req.header('x-admin-email')) ||
                asString(req.auth?.email);
            const waitlistId = asString(req.body?.waitlistId);

            const result = await WaitlistAdminService.inviteWaitlistById({
                adminEmail,
                authorizationHeader: req.header('authorization') || '',
                waitlistId,
            });

            return res.status(200).json({
                success: true,
                data: result,
            });
        } catch (error) {
            const status = resolveWaitlistErrorStatus(error);
            if (status >= 500) {
                return next(error);
            }
            return res.status(status).json({
                success: false,
                error: resolveWaitlistErrorMessage(error),
            });
        }
    },

    /**
     * POST /api/admin/waitlist/invite-next
     */
    inviteNextWaitlist: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const adminEmail =
                asString(req.body?.adminEmail) ||
                asString(req.header('x-admin-email')) ||
                asString(req.auth?.email);
            const batchSizeRaw = Number(req.body?.batchSize ?? req.body?.count ?? 10);
            const batchSize = Number.isFinite(batchSizeRaw) ? Math.floor(batchSizeRaw) : 10;

            if (batchSize < 1 || batchSize > 250) {
                return res.status(400).json({
                    success: false,
                    error: 'batchSize must be between 1 and 250.',
                });
            }

            const result = await WaitlistAdminService.inviteNextWaitlist({
                adminEmail,
                authorizationHeader: req.header('authorization') || '',
                batchSize,
            });

            return res.status(200).json({
                success: true,
                data: result,
            });
        } catch (error) {
            const status = resolveWaitlistErrorStatus(error);
            if (status >= 500) {
                return next(error);
            }
            return res.status(status).json({
                success: false,
                error: resolveWaitlistErrorMessage(error),
            });
        }
    },

    /**
     * POST /api/admin/waitlist/sync
     */
    syncWaitlist: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const adminEmail =
                asString(req.body?.adminEmail) ||
                asString(req.header('x-admin-email')) ||
                asString(req.auth?.email);

            const result = await WaitlistAdminService.syncWaitlist({
                adminEmail,
                authorizationHeader: req.header('authorization') || '',
            });

            return res.status(200).json({
                success: true,
                data: result,
            });
        } catch (error) {
            const status = resolveWaitlistErrorStatus(error);
            if (status >= 500) {
                return next(error);
            }
            return res.status(status).json({
                success: false,
                error: resolveWaitlistErrorMessage(error),
            });
        }
    },

    /**
     * GET /api/admin/stats
     */
    getStats: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const stats = await AdminService.getProtocolStats();
            return res.status(200).json({ success: true, data: stats });
        } catch (error) {
            next(error);
        }
    },

    /**
     * POST /api/admin/override
     */
    createOverride: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const actorId = req.auth?.userId;
            const {
                user_id,
                score,
                risk_tier,
                model_version,
                feature_vector_hash,
                reason,
                snapshot_time,
            } = req.body || {};

            if (!actorId) {
                return res.status(401).json({ success: false, error: 'Unauthenticated request.' });
            }

            if (!user_id || !UUID_V4_REGEX.test(user_id)) {
                return res.status(400).json({ success: false, error: 'user_id must be a valid UUID v4.' });
            }

            if (typeof score !== 'number' || score < 0 || score > 100) {
                return res.status(400).json({ success: false, error: 'score must be between 0 and 100.' });
            }

            if (typeof risk_tier !== 'number' || risk_tier < 0) {
                return res.status(400).json({ success: false, error: 'risk_tier must be a non-negative number.' });
            }

            if (!model_version || typeof model_version !== 'string') {
                return res.status(400).json({ success: false, error: 'model_version is required.' });
            }

            if (!feature_vector_hash || typeof feature_vector_hash !== 'string') {
                return res.status(400).json({ success: false, error: 'feature_vector_hash is required.' });
            }

            if (!reason || typeof reason !== 'string') {
                return res.status(400).json({ success: false, error: 'reason is required for manual override.' });
            }

            const snapshot = await AdminService.createScoreOverride({
                actorId,
                userId: user_id,
                score,
                riskTier: risk_tier,
                modelVersion: model_version,
                featureVectorHash: feature_vector_hash,
                snapshotTime: snapshot_time,
                reason,
            });

            return res.status(201).json({ success: true, data: snapshot });
        } catch (error) {
            next(error);
        }
    },

    /**
     * GET /api/admin/audit
     */
    getAuditLogs: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;
            const offsetRaw = typeof req.query.offset === 'string' ? Number(req.query.offset) : 0;
            const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 50;
            const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

            const logs = await AdminService.getAuditLogs(limit, offset);

            return res.status(200).json({
                success: true,
                data: logs,
                meta: { limit, offset },
            });
        } catch (error) {
            next(error);
        }
    },
};
