import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as DeveloperController from '../controllers/developerController';

const router = Router();
router.use(requireAuth);

router.get('/keys', DeveloperController.getKeys);
router.post('/keys', DeveloperController.createKey);
router.delete('/keys/:id', DeveloperController.revokeKey);
router.get('/plan', DeveloperController.getPlan);
router.get('/usage', DeveloperController.getUsage);
router.get('/audit', DeveloperController.getAudit);

export default router;
