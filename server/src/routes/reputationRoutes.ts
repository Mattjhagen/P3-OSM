/**
 * B2B Developer API v1: Reputation score endpoints.
 * Auth: API key (Bearer). Scopes: score:read, score:history. Rate limited per key.
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth, requireScopes } from '../middleware/apiKeyAuth';
import { developerRateLimiter } from '../middleware/developerRateLimiter';
import { fetchScoreInput, computeReputationScore } from '../modules/reputation';
import { supabase } from '../config/supabase';
import { logUsage } from '../services/developerApiLog';

const router = Router();

router.use(apiKeyAuth);
router.use(developerRateLimiter);

function getPath(req: Request): string {
  return req.originalUrl?.split('?')[0] ?? req.path;
}

async function sendAndLog(
  req: Request,
  res: Response,
  statusCode: number,
  body: object,
  startTime: number
): Promise<void> {
  const path = getPath(req);
  const latencyMs = Math.round(Date.now() - startTime);
  res.status(statusCode).json(body);
  if (req.apiKey) {
    await logUsage(req.apiKey.id, path, statusCode, latencyMs);
  }
}

/** GET /api/v1/reputation/score?user_id=... */
router.get('/score', requireScopes('score:read'), async (req: Request, res: Response) => {
  const start = Date.now();
  const userId = (req.query.user_id as string)?.trim();
  if (!userId) {
    return sendAndLog(req, res, 400, { success: false, error: 'Missing user_id.' }, start);
  }
  try {
    const input = await fetchScoreInput({ userId });
    if (!input) {
      return sendAndLog(req, res, 404, { success: false, error: 'User not found.' }, start);
    }
    const result = computeReputationScore(input);
    return sendAndLog(
      req,
      res,
      200,
      { success: true, data: { score: result.score, band: result.band, reasons: result.reasons } },
      start
    );
  } catch (e) {
    return sendAndLog(req, res, 500, { success: false, error: 'Internal error.' }, start);
  }
});

/** GET /api/v1/reputation/score/by-wallet?address=0x... */
router.get('/score/by-wallet', requireScopes('score:read'), async (req: Request, res: Response) => {
  const start = Date.now();
  const address = (req.query.address as string)?.trim();
  if (!address) {
    return sendAndLog(req, res, 400, { success: false, error: 'Missing address.' }, start);
  }
  try {
    const input = await fetchScoreInput({ walletAddress: address });
    if (!input) {
      return sendAndLog(req, res, 404, { success: false, error: 'User not found for wallet.' }, start);
    }
    const result = computeReputationScore(input);
    return sendAndLog(
      req,
      res,
      200,
      { success: true, data: { userId: input.userId, score: result.score, band: result.band, reasons: result.reasons } },
      start
    );
  } catch (e) {
    return sendAndLog(req, res, 500, { success: false, error: 'Internal error.' }, start);
  }
});

/** POST /api/v1/reputation/score/batch body: { user_ids: string[] } */
router.post('/score/batch', requireScopes('score:read'), async (req: Request, res: Response) => {
  const start = Date.now();
  const userIds = req.body?.user_ids;
  if (!Array.isArray(userIds) || userIds.length === 0 || userIds.length > 50) {
    return sendAndLog(req, res, 400, { success: false, error: 'Provide user_ids array (1–50).' }, start);
  }
  try {
    const results = await Promise.all(
      userIds.slice(0, 50).map(async (id: string) => {
        const input = await fetchScoreInput({ userId: String(id).trim() });
        if (!input) return { userId: id, found: false };
        const result = computeReputationScore(input);
        return { userId: id, found: true, score: result.score, band: result.band, reasons: result.reasons };
      })
    );
    return sendAndLog(req, res, 200, { success: true, data: results }, start);
  } catch (e) {
    return sendAndLog(req, res, 500, { success: false, error: 'Internal error.' }, start);
  }
});

/** GET /api/v1/reputation/score/history?user_id=...&from=...&to=... */
router.get('/score/history', requireScopes('score:history'), async (req: Request, res: Response) => {
  const start = Date.now();
  const userId = (req.query.user_id as string)?.trim();
  if (!userId) {
    return sendAndLog(req, res, 400, { success: false, error: 'Missing user_id.' }, start);
  }
  const from = (req.query.from as string)?.trim();
  const to = (req.query.to as string)?.trim();
  try {
    let q = supabase
      .from('trust_score_snapshots')
      .select('score, risk_tier, snapshot_time, model_version')
      .eq('user_id', userId)
      .order('snapshot_time', { ascending: false })
      .limit(100);
    if (from) q = q.gte('snapshot_time', from);
    if (to) q = q.lte('snapshot_time', to);
    const { data, error } = await q;
    if (error) {
      return sendAndLog(req, res, 500, { success: false, error: 'Internal error.' }, start);
    }
    return sendAndLog(req, res, 200, { success: true, data: data ?? [] }, start);
  } catch (e) {
    return sendAndLog(req, res, 500, { success: false, error: 'Internal error.' }, start);
  }
});

export default router;
