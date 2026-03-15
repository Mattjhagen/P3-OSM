import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';
import { WithdrawalController } from '../controllers/withdrawalController';

const router = Router();

router.post('/', requireAuth, createRateLimiter(20, 15), WithdrawalController.requestWithdrawal);

export default router;
