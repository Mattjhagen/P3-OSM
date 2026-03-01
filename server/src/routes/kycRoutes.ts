import { Router } from 'express';
import { KycController } from '../controllers/kycController';
import { createRateLimiter } from '../middleware/rateLimiter';

const router = Router();
const limiter = createRateLimiter(30, 15);

router.post('/start', limiter, KycController.start);
router.get('/status/:sessionId', limiter, KycController.status);
router.post('/webhook', KycController.webhook);

export default router;
