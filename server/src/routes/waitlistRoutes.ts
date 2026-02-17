import { Router } from 'express';
import { WaitlistController } from '../controllers/waitlistController';
import { createRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/invite', createRateLimiter(20, 15), WaitlistController.sendInvite);
router.post(
  '/invite-batch',
  createRateLimiter(5, 15),
  WaitlistController.sendBatchInvites
);

export default router;
