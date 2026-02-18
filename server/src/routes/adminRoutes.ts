import { Router } from 'express';
import { AdminController } from '../controllers/adminController';
import { requireAuth, requireRoles } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.get('/waitlist', createRateLimiter(120, 15), AdminController.getWaitlist);
router.post('/waitlist/sync', createRateLimiter(30, 15), AdminController.syncWaitlist);
router.post('/waitlist/invite', createRateLimiter(30, 15), AdminController.inviteWaitlist);
router.post(
  '/waitlist/manual-invite',
  createRateLimiter(30, 15),
  AdminController.manualInviteWaitlist
);
router.post(
  '/waitlist/invite-next',
  createRateLimiter(20, 15),
  AdminController.inviteNextWaitlist
);

router.use(requireAuth);
router.use(requireRoles('admin', 'risk_officer', 'service_role'));

router.get('/stats', AdminController.getStats);
router.post('/override', AdminController.createOverride);
router.get('/audit', AdminController.getAuditLogs);

export default router;
