import { Router } from 'express';
import { ComplianceController } from '../controllers/complianceController';
import { createRateLimiter, sensitiveApiLimiter } from '../middleware/rateLimiter';

const router = Router();

router.get('/features/status', sensitiveApiLimiter, ComplianceController.getFeatureStatus);
router.post('/features/apply', createRateLimiter(40, 15), ComplianceController.applyForFeature);

router.get('/disclosures', sensitiveApiLimiter, ComplianceController.listDisclosures);
router.get('/disclosures/:id/download', sensitiveApiLimiter, ComplianceController.downloadDisclosure);

router.get('/statements', sensitiveApiLimiter, ComplianceController.listStatements);
router.get('/statements/:id/download', sensitiveApiLimiter, ComplianceController.downloadStatement);
router.post('/statements/run/monthly', createRateLimiter(5, 60), ComplianceController.runMonthlyGeneration);
router.post('/statements/run/yearly', createRateLimiter(5, 60), ComplianceController.runYearlyGeneration);

export default router;
