import { Router, Request, Response } from 'express';
import { analyzeRiskProfile } from '../services/claudeRiskService';

const router = Router();

/**
 * POST /api/risk/analyze
 * Body: { walletAgeDays?, txCount?, successfulRepayments?, currentStreak?, kycStatus?, income?, employmentStatus? }
 */
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const report = await analyzeRiskProfile(req.body ?? {});
    return res.json({ success: true, data: report });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message ?? 'Internal error' });
  }
});

export default router;
