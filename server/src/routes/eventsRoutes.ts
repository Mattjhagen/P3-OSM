import { Router } from 'express';
import { EventsController } from '../controllers/eventsController';
import { createRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/', createRateLimiter(300, 60), EventsController.ingest);

export default router;
