import { Router } from 'express';
import { PaymentController } from '../controllers/paymentController';
import { requireAuth } from '../middleware/auth';
import { publicApiLimiter } from '../middleware/rateLimiter';

const router = Router();

// Deposit and service checkout require auth so userId is bound to authenticated user
router.post('/deposit/create', requireAuth, publicApiLimiter, PaymentController.createCheckoutSession);
router.post('/create-checkout-session', requireAuth, publicApiLimiter, PaymentController.createCheckoutSession);
router.post('/donations/create-checkout-session', publicApiLimiter, PaymentController.createDonationCheckoutSession);
router.get('/services/catalog', publicApiLimiter, PaymentController.getServiceCatalog);
router.post('/services/tax-quote', publicApiLimiter, PaymentController.createServiceTaxQuote);
router.post('/services/create-checkout-session', requireAuth, publicApiLimiter, PaymentController.createServiceCheckoutSession);

export default router;
