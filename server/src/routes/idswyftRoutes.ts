import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';
import { IdswyftController } from '../controllers/idswyftController';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(requireAuth);

router.post('/initialize', createRateLimiter(20, 15), IdswyftController.initialize);
router.post('/upload/front', upload.single('file'), IdswyftController.uploadFront);
router.post('/upload/back', upload.single('file'), IdswyftController.uploadBack);
router.post('/upload/live', upload.single('file'), IdswyftController.uploadLive);
router.get('/:id/status', IdswyftController.status);

export default router;
