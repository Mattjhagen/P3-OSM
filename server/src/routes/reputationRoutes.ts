/**
 * B2B Developer API v1: Reputation score endpoints.
 * Auth: API key (Bearer). Scopes: score:read, score:history. Rate limited per key.
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth, requireScopes } from '../middleware/apiKeyAuth';
import { developerRateLimiter } from '../middleware/developerRateLimiter';
import { developerPlanGuard } from '../middleware/developerPlanGuard';
import { developerMonthlyQuota } from '../middleware/developerMonthlyQuota';
import {
  fetchScoreInput,
  computeReputationScore,
  getLatestSnapshot,
  isSnapshotFresh,
  snapshotToApiResult,
  writeScoreSnapshot,
} from '../modules/reputation';
import { supabase } from '../config/supabase';
import { logUsage } from '../services/developerApiLog';

const router = Router();

router.use((req, res, next) => {
  (res.locals as any).devApiStartTime = Date.now();
  next();
});
router.use(apiKeyAuth);
router.use(developerPlanGuard);
router.use(developerRateLimiter);
router.use(developerMonthlyQuota);

function getPath(req: Request): string {
  return req.originalUrl?.split('?')[0] ?? req.path;
}

async function sendAndLog(
  req: Request,
  res: Response,
  statusCode: number,
  body: object
): Promise<void> {
  const path = getPath(req);
  const startTime = (res.locals as any)?.devApiStartTime;
  const latencyMs = Math.round(Date.now() - (typeof startTime === 'number' ? startTime : Date.now()));
  res.status(statusCode).json(body);
  if (req.apiKey) {
    await logUsage(req.apiKey.id, path, statusCode, latencyMs);
  }
}

async function getScoreForUser(userId: string, orgId?: string): Promise<{
  source: 'snapshot' | 'computed';
  result: ReturnType<typeof computeReputationScore>;
  computedAt?: string;
}> {
  const latest = await getLatestSnapshot(userId);
  if (latest && isSnapshotFresh(latest, 15)) {
    return { source: 'snapshot', result: snapshotToApiResult(latest), computedAt: latest.computed_at };
  }

  const features = await fetchScoreInput({ userId });
  if (!features) {
    throw new Error('USER_NOT_FOUND');
  }

  const result = computeReputationScore(features);
  await writeScoreSnapshot({ userId, orgId: orgId ?? null, result, features });
  return { source: 'computed', result, computedAt: new Date().toISOString() };
}

/** GET /api/v1/reputation/score?user_id=... */
router.get('/score', requireScopes('score:read'), async (req: Request, res: Response) => {
  const userId = (req.query.user_id as string)?.trim();
  if (!userId) {
    return sendAndLog(req, res, 400, { success: false, error: 'Missing user_id.' });
  }
  try {
    const score = await getScoreForUser(userId, req.apiKey?.orgId);
    return sendAndLog(
      req,
      res,
      200,
      {
        success: true,
        data: {
          user_id: userId,
          score: score.result.score,
          band: score.result.band,
          reasons: score.result.reasons,
          trust_score: score.result.trust_score,
          risk_score: score.result.risk_score,
          capacity_score: score.result.capacity_score,
          reputation_score: score.result.reputation_score,
          top_reasons_positive: score.result.top_reasons_positive,
          top_reasons_negative: score.result.top_reasons_negative,
          missing_data: score.result.missing_data,
          caps_applied: score.result.caps_applied,
          computed_at: score.computedAt ?? null,
          source: score.source,
        },
      }
    );
  } catch (e) {
    if (e instanceof Error && e.message === 'USER_NOT_FOUND') {
      return sendAndLog(req, res, 404, { success: false, error: 'User not found.' });
    }
    return sendAndLog(req, res, 500, { success: false, error: 'Internal error.' });
  }
});

/** GET /api/v1/reputation/score/by-wallet?address=0x... */
router.get('/score/by-wallet', requireScopes('score:read'), async (req: Request, res: Response) => {
  const address = (req.query.address as string)?.trim();
  if (!address) {
    return sendAndLog(req, res, 400, { success: false, error: 'Missing address.' });
  }
  try {
    const features = await fetchScoreInput({ walletAddress: address });
    if (!features) {
      return sendAndLog(req, res, 404, { success: false, error: 'User not found for wallet.' });
    }
    const score = await getScoreForUser(features.userId, req.apiKey?.orgId);
    return sendAndLog(
      req,
      res,
      200,
      {
        success: true,
        data: {
          userId: features.userId,
          score: score.result.score,
          band: score.result.band,
          reasons: score.result.reasons,
          trust_score: score.result.trust_score,
          risk_score: score.result.risk_score,
          capacity_score: score.result.capacity_score,
          reputation_score: score.result.reputation_score,
          top_reasons_positive: score.result.top_reasons_positive,
          top_reasons_negative: score.result.top_reasons_negative,
          missing_data: score.result.missing_data,
          caps_applied: score.result.caps_applied,
          computed_at: score.computedAt ?? null,
          source: score.source,
        },
      }
    );
  } catch (e) {
    return sendAndLog(req, res, 500, { success: false, error: 'Internal error.' });
  }
});

/** POST /api/v1/reputation/score/batch body: { user_ids: string[] } */
router.post('/score/batch', requireScopes('score:read'), async (req: Request, res: Response) => {
  const userIds = req.body?.user_ids;
  if (!Array.isArray(userIds) || userIds.length === 0 || userIds.length > 50) {
    return sendAndLog(req, res, 400, { success: false, error: 'Provide user_ids array (1–50).' });
  }
  try {
    const results = await Promise.all(
      userIds.slice(0, 50).map(async (id: string) => {
        const userId = String(id).trim();
        const features = await fetchScoreInput({ userId });
        if (!features) return { userId, found: false };
        const score = await getScoreForUser(features.userId, req.apiKey?.orgId);
        return {
          userId,
          found: true,
          score: score.result.score,
          band: score.result.band,
          reasons: score.result.reasons,
          trust_score: score.result.trust_score,
          risk_score: score.result.risk_score,
          capacity_score: score.result.capacity_score,
          reputation_score: score.result.reputation_score,
          top_reasons_positive: score.result.top_reasons_positive,
          top_reasons_negative: score.result.top_reasons_negative,
          missing_data: score.result.missing_data,
          caps_applied: score.result.caps_applied,
          computed_at: score.computedAt ?? null,
          source: score.source,
        };
      })
    );
    return sendAndLog(req, res, 200, { success: true, data: results });
  } catch (e) {
    return sendAndLog(req, res, 500, { success: false, error: 'Internal error.' });
  }
});

/** GET /api/v1/reputation/score/history?user_id=...&from=...&to=... */
router.get('/score/history', requireScopes('score:history'), async (req: Request, res: Response) => {
  const userId = (req.query.user_id as string)?.trim();
  if (!userId) {
    return sendAndLog(req, res, 400, { success: false, error: 'Missing user_id.' });
  }
  const from = (req.query.from as string)?.trim();
  const to = (req.query.to as string)?.trim();
  try {
    let q = supabase
      .from('rep_score_snapshots')
      .select('trust_score, risk_score, capacity_score, reputation_score, band, reasons, computed_at')
      .eq('user_id', userId)
      .order('computed_at', { ascending: false })
      .limit(100);
    if (from) q = q.gte('computed_at', from);
    if (to) q = q.lte('computed_at', to);
    const { data, error } = await q;
    if (error) {
      return sendAndLog(req, res, 500, { success: false, error: 'Internal error.' });
    }
    return sendAndLog(req, res, 200, {
      success: true,
      data: (data ?? []).map((row: any) => {
        const r = (row.reasons ?? {}) as Record<string, string[]>;
        return {
          score: row.reputation_score,
          reputation_score: row.reputation_score,
          trust_score: row.trust_score,
          risk_score: row.risk_score,
          capacity_score: row.capacity_score,
          band: row.band,
          reasons: [
            ...(Array.isArray(r.top_reasons_positive) ? r.top_reasons_positive : []),
            ...(Array.isArray(r.top_reasons_negative) ? r.top_reasons_negative : []),
            ...(Array.isArray(r.missing_data) ? r.missing_data : []),
            ...(Array.isArray(r.caps_applied) ? r.caps_applied : []),
          ],
          top_reasons_positive: Array.isArray(r.top_reasons_positive) ? r.top_reasons_positive : [],
          top_reasons_negative: Array.isArray(r.top_reasons_negative) ? r.top_reasons_negative : [],
          missing_data: Array.isArray(r.missing_data) ? r.missing_data : [],
          caps_applied: Array.isArray(r.caps_applied) ? r.caps_applied : [],
          computed_at: row.computed_at,
        };
      }),
    });
  } catch (e) {
    return sendAndLog(req, res, 500, { success: false, error: 'Internal error.' });
  }
});

export default router;
