import { Router } from 'express';
import { NotificationController } from '../controllers/notificationController';
import { requireAuth } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.use(requireAuth);

router.post('/admin', createRateLimiter(30, 15), NotificationController.notifyAdmin);

export default router;

