import { Router } from 'express';
import { createRateLimiter } from '../middleware/rateLimiter';
import { WithdrawalController } from '../controllers/withdrawalController';

const router = Router();

router.post('/', createRateLimiter(20, 15), WithdrawalController.requestWithdrawal);

export default router;
