import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { createRateLimiter, publicApiLimiter, sensitiveApiLimiter } from '../middleware/rateLimiter';
import { TradingController } from '../controllers/tradingController';

const router = Router();

router.get('/prices', publicApiLimiter, TradingController.getPrices);
router.post('/orders/preview', requireAuth, sensitiveApiLimiter, TradingController.previewOrder);
router.post('/orders/execute', requireAuth, createRateLimiter(30, 15), TradingController.executeOrder);

export default router;
