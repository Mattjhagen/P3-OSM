import { Router } from 'express';
import { createRateLimiter, publicApiLimiter, sensitiveApiLimiter } from '../middleware/rateLimiter';
import { TradingController } from '../controllers/tradingController';

const router = Router();

router.get('/prices', publicApiLimiter, TradingController.getPrices);
router.post('/orders/preview', sensitiveApiLimiter, TradingController.previewOrder);
router.post('/orders/execute', createRateLimiter(30, 15), TradingController.executeOrder);

export default router;
