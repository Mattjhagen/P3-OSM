import { Router, Request, Response } from 'express';
import { analyzeRiskProfile } from '../services/claudeRiskService';
import { sensitiveApiLimiter } from '../middleware/rateLimiter';

const router = Router();

/**
 * POST /api/risk/analyze
 * Unauthenticated; rate-limited to prevent abuse (Claude API cost).
 * Body: { walletAgeDays?, txCount?, successfulRepayments?, currentStreak?, kycStatus?, income?, employmentStatus? }
 * Responses: 200 { success, data }, 429 rate limit, 500 error.
 */
router.post('/analyze', sensitiveApiLimiter, async (req: Request, res: Response) => {
  try {
    const report = await analyzeRiskProfile(req.body ?? {});
    return res.json({ success: true, data: report });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message ?? 'Internal error' });
  }
});

export default router;
