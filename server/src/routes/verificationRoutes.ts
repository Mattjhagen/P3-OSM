import { Router } from 'express';
import { VerificationController } from '../controllers/verificationController';
import { requireAuth } from '../middleware/auth';
import { createRateLimiter, sensitiveApiLimiter } from '../middleware/rateLimiter';

const router = Router();

// Hash Verification Endpoint
router.post('/hash', VerificationController.verifyHash);

router.post('/kyc', requireAuth, VerificationController.submitKYC);
router.get('/status/:userId', requireAuth, VerificationController.getStatus);
router.post('/attestation', requireAuth, VerificationController.createAttestation);

// Stripe Identity (KYC/AML)
router.post('/stripe/session', createRateLimiter(30, 15), VerificationController.createStripeIdentitySession);
router.get('/stripe/session/:sessionId', sensitiveApiLimiter, VerificationController.getStripeIdentitySessionStatus);
router.get('/stripe/sessions', sensitiveApiLimiter, VerificationController.listStripeIdentitySessions);

export default router;
