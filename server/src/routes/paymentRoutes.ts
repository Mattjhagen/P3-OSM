import { Router } from 'express';
import { PaymentController } from '../controllers/paymentController';
import { publicApiLimiter } from '../middleware/rateLimiter';

const router = Router();

// Create Checkout Session
router.post('/create-checkout-session', publicApiLimiter, PaymentController.createCheckoutSession);
router.post('/donations/create-checkout-session', publicApiLimiter, PaymentController.createDonationCheckoutSession);

export default router;
