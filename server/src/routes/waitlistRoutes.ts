import { Router } from 'express';
import { WaitlistController } from '../controllers/waitlistController';
import { requireAuth } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post(
  '/sync-netlify',
  requireAuth,
  createRateLimiter(10, 15),
  WaitlistController.syncFromNetlify
);
router.post('/invite', createRateLimiter(20, 15), WaitlistController.sendInvite);
router.post(
  '/invite-batch',
  createRateLimiter(5, 15),
  WaitlistController.sendBatchInvites
);

export default router;
