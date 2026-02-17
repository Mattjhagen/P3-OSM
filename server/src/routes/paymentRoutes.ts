import { Router } from 'express';
import { PaymentController } from '../controllers/paymentController';
import { publicApiLimiter } from '../middleware/rateLimiter';

const router = Router();

// Create Checkout Session
router.post('/deposit/create', publicApiLimiter, PaymentController.createCheckoutSession);
router.post('/create-checkout-session', publicApiLimiter, PaymentController.createCheckoutSession);
router.post('/donations/create-checkout-session', publicApiLimiter, PaymentController.createDonationCheckoutSession);
router.get('/services/catalog', publicApiLimiter, PaymentController.getServiceCatalog);
router.post('/services/tax-quote', publicApiLimiter, PaymentController.createServiceTaxQuote);
router.post('/services/create-checkout-session', publicApiLimiter, PaymentController.createServiceCheckoutSession);

export default router;
