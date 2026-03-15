import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';
import { PlaidController } from '../controllers/plaidController';

const router = Router();

router.use(requireAuth);

router.post('/link-token', createRateLimiter(40, 15), PlaidController.createLinkToken);
router.post('/exchange-public-token', createRateLimiter(30, 15), PlaidController.exchangePublicToken);
router.post('/exchange_public_token', createRateLimiter(30, 15), PlaidController.exchangePublicToken);
router.post('/identity-check', createRateLimiter(20, 15), PlaidController.identityCheck);

export default router;
