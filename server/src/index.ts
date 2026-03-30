import express, { Request, Response } from 'express';
import cors from 'cors';
import { config } from './config/config';
import { errorHandler } from './middleware/errorHandler';

// Import Routes (Placeholders)
import userRoutes from './routes/userRoutes';
import loanRoutes from './routes/loanRoutes';
import verificationRoutes from './routes/verificationRoutes';
import adminRoutes from './routes/adminRoutes';
import paymentRoutes from './routes/paymentRoutes';
import waitlistRoutes from './routes/waitlistRoutes';
import tradingRoutes from './routes/tradingRoutes';
import withdrawalRoutes from './routes/withdrawalRoutes';
import idswyftRoutes from './routes/idswyftRoutes';
import kycRoutes from './routes/kycRoutes';
import notificationRoutes from './routes/notificationRoutes';
import complianceRoutes from './routes/complianceRoutes';
import reputationRoutes from './routes/reputationRoutes';
import developerRoutes from './routes/developerRoutes';
import riskRoutes from './routes/riskRoutes';
import eventsRoutes from './routes/eventsRoutes';
import { openApiSpec } from './openapiSpec';
import { PaymentController } from './controllers/paymentController';
import { VerificationController } from './controllers/verificationController';
import { TradingController } from './controllers/tradingController';
import { publicApiLimiter } from './middleware/rateLimiter';
import { securityHeaders } from './middleware/securityHeaders';
import { ComplianceService } from './services/complianceService';

export const createApp = () => {
    const app = express();

    app.use(securityHeaders);

    // Middleware: in production restrict CORS to FRONTEND_URL and CORS_ALLOWED_ORIGINS
    const corsOptions: cors.CorsOptions = config.corsAllowedOrigins?.length
        ? {
              origin: (origin, cb) => {
                  if (!origin) return cb(null, true); // same-origin or non-browser
                  const allowed = new Set(config.corsAllowedOrigins);
                  return cb(null, allowed.has(origin));
              },
              optionsSuccessStatus: 200,
          }
        : {};
    app.use(cors(corsOptions));

    // Stripe webhook must receive raw body for signature verification.
    app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), PaymentController.handleWebhook);
    app.post(
        '/api/verification/stripe/webhook',
        express.raw({ type: 'application/json' }),
        VerificationController.handleStripeIdentityWebhook
    );

    app.use(express.json());

    // Routes
    app.use('/api/users', userRoutes);
    app.use('/api/loans', loanRoutes);
    app.use('/api/verification', verificationRoutes);
    app.use('/api/admin', adminRoutes);
    app.use('/api/payments', paymentRoutes);
    app.use('/api/waitlist', waitlistRoutes);
    app.use('/api/trading', tradingRoutes);
    app.use('/api/withdrawals', withdrawalRoutes);
    app.use('/api/idswyft', idswyftRoutes);
    app.use('/api/kyc', kycRoutes);
    app.use('/api/notifications', notificationRoutes);
    app.use('/api/compliance', complianceRoutes);
    app.use('/api/v1/reputation', reputationRoutes);
    app.use('/api/developer', developerRoutes);
    app.use('/api/risk', riskRoutes);
    app.use('/api/events', eventsRoutes);
    app.get('/docs/openapi.json', (_req: Request, res: Response) => {
        res.setHeader('Content-Type', 'application/json');
        res.json(openApiSpec);
    });
    app.get('/api/prices', publicApiLimiter, TradingController.getPrices);

    const getProviderStatus = () => ({
        stripePaymentsConfigured: Boolean(config.stripe.secretKey),
        stripePayoutsEnabled: Boolean(config.stripe.secretKey && config.stripe.payoutsEnabled),
        btcWithdrawalsEnabled: Boolean(
            config.withdrawals.btcEnabled &&
                config.withdrawals.btcProviderUrl &&
                config.withdrawals.btcProviderToken
        ),
        cryptoProvider: config.crypto.provider,
        tradingProviderEnabled: Boolean(config.trading.providerEnabled),
    });

    // Legacy health endpoint retained for compatibility.
    app.get('/health', (req: Request, res: Response) => {
        res.status(200).json({
            status: 'active',
            timestamp: new Date().toISOString(),
            providers: getProviderStatus(),
        });
    });

    // API health endpoint consumed by status_check netlify function.
    app.get('/api/health', (req: Request, res: Response) => {
        res.status(200).json({
            ok: true,
            service: 'render-backend',
            status: 'active',
            timestamp: new Date().toISOString(),
            providers: getProviderStatus(),
        });
    });

    // Error handling
    app.use(errorHandler);

    return app;
};

const app = createApp();

if (process.env.NODE_ENV !== 'test') {
    ComplianceService.startStatementScheduler();
    app.listen(config.port, () => {
        console.log(`P3 Backend running on port ${config.port}`);
    });
}

export default app;
