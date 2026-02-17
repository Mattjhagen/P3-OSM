import { Request, Response, NextFunction } from 'express';
import Stripe from 'stripe';
import { config } from '../config/config';
import logger from '../utils/logger';
import { supabase } from '../config/supabase';
import { AccountRecoveryService } from '../services/accountRecoveryService';
import { ComplianceService } from '../services/complianceService';

const DEFAULT_FRONTEND_URL = 'https://p3lending.space';
const DONATION_AUDIT_ACTION = 'STRIPE_DONATION_COMPLETED';

let stripeClient: Stripe | null = null;

const getStripeClient = () => {
    if (!config.stripe.secretKey) {
        return null;
    }

    if (!stripeClient) {
        stripeClient = new Stripe(config.stripe.secretKey, {
            apiVersion: '2023-10-16' as any,
        });
    }

    return stripeClient;
};

const normalizeAmount = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value > 0 ? value : null;
    }

    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }

    return null;
};

const resolveFrontendBaseUrl = (req: Request) => {
    const configured = (config.frontendUrl || '').trim();
    const requestOrigin =
        typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
    const baseUrl = configured || requestOrigin || DEFAULT_FRONTEND_URL;
    return baseUrl.replace(/\/+$/, '');
};

const hasProcessedDonationEvent = async (eventId: string) => {
    const { data, error } = await supabase
        .from('audit_log')
        .select('id')
        .eq('action', DONATION_AUDIT_ACTION)
        .eq('metadata->>stripe_event_id', eventId)
        .limit(1);

    if (error) {
        throw new Error(`Failed to check donation event idempotency: ${error.message}`);
    }

    return Array.isArray(data) && data.length > 0;
};

const persistDonationAudit = async (session: Stripe.Checkout.Session, eventId: string) => {
    const alreadyProcessed = await hasProcessedDonationEvent(eventId);
    if (alreadyProcessed) {
        logger.info({ eventId, sessionId: session.id }, 'Stripe donation event already processed');
        return;
    }

    const metadataAmount = normalizeAmount(session.metadata?.amountUsd);
    const amountUsd =
        typeof session.amount_total === 'number'
            ? session.amount_total / 100
            : metadataAmount || 0;
    const donorEmail =
        session.customer_details?.email ||
        session.customer_email ||
        session.metadata?.donorEmail ||
        null;
    const donorName = session.customer_details?.name || session.metadata?.donorName || null;
    const source = session.metadata?.source || 'unknown';
    const paymentIntentId =
        typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id || null;

    const { error } = await supabase.from('audit_log').insert({
        action: DONATION_AUDIT_ACTION,
        resource_type: 'donation',
        metadata: {
            stripe_event_id: eventId,
            stripe_session_id: session.id,
            stripe_payment_intent_id: paymentIntentId,
            amount_usd: amountUsd,
            currency: (session.currency || 'usd').toUpperCase(),
            donor_email: donorEmail,
            donor_name: donorName,
            source,
            payment_status: session.payment_status || 'unknown',
            livemode: Boolean(session.livemode),
        },
    });

    if (error) {
        throw new Error(`Failed to persist donation audit log: ${error.message}`);
    }

    logger.info(
        { eventId, sessionId: session.id, amountUsd, donorEmail, source },
        'Donation recorded from Stripe webhook'
    );
};

export const PaymentController = {
    /**
     * Creates a Stripe Checkout Session for deposits.
     */
    createCheckoutSession: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const amount = normalizeAmount(req.body?.amount);
            const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
            const userEmail =
                typeof req.body?.userEmail === 'string' ? req.body.userEmail.trim() : undefined;
            const stripe = getStripeClient();
            const frontendBaseUrl = resolveFrontendBaseUrl(req);

            if (!stripe) {
                return res.status(503).json({
                    success: false,
                    error: 'Stripe is not configured on the server. Please add STRIPE_SECRET_KEY to .env',
                });
            }

            if (!amount || !userId) {
                return res.status(400).json({ success: false, error: 'Missing amount or userId' });
            }

            if (amount > 100000) {
                return res
                    .status(400)
                    .json({ success: false, error: 'Amount exceeds max allowed deposit.' });
            }

            await ComplianceService.requireFeatureApproval(userId, 'ADD_FUNDS');

            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [
                    {
                        price_data: {
                            currency: 'usd',
                            product_data: {
                                name: 'P3 Protocol Deposit',
                                description: `Deposit for user ${userId}`,
                            },
                            unit_amount: Math.round(amount * 100), // Stripe uses cents
                        },
                        quantity: 1,
                    },
                ],
                mode: 'payment',
                success_url: `${frontendBaseUrl}/profile?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${frontendBaseUrl}/profile`,
                customer_email: userEmail,
                metadata: {
                    userId,
                    amount: amount.toString(),
                    flow: 'deposit',
                },
                // Disable automatic tax for wallet deposits
                automatic_tax: { enabled: false },
            });

            if (!session.url) {
                return res
                    .status(502)
                    .json({ success: false, error: 'Stripe did not return a checkout URL.' });
            }

            return res.status(200).json({
                success: true,
                data: {
                    checkoutUrl: session.url,
                    sessionId: session.id,
                },
            });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Stripe Session Creation Failed');
            next(error);
        }
    },

    /**
     * Creates a Stripe Checkout Session for public donations.
     */
    createDonationCheckoutSession: async (
        req: Request,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const stripe = getStripeClient();
            const amountUsd = normalizeAmount(req.body?.amountUsd);
            const donorEmail =
                typeof req.body?.donorEmail === 'string'
                    ? req.body.donorEmail.trim()
                    : '';
            const donorName =
                typeof req.body?.donorName === 'string' ? req.body.donorName.trim() : '';
            const source = typeof req.body?.source === 'string' ? req.body.source.trim() : '';
            const frontendBaseUrl = resolveFrontendBaseUrl(req);

            if (!amountUsd) {
                return res.status(400).json({
                    success: false,
                    error: 'amountUsd must be a positive number.',
                });
            }

            if (amountUsd < 1 || amountUsd > 100000) {
                return res.status(400).json({
                    success: false,
                    error: 'Donation amount must be between $1 and $100,000.',
                });
            }

            if (!stripe) {
                return res.status(503).json({
                    success: false,
                    error: 'Stripe is not configured on the server. Please add STRIPE_SECRET_KEY to .env',
                });
            }

            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                mode: 'payment',
                submit_type: 'donate',
                line_items: [
                    {
                        price_data: {
                            currency: 'usd',
                            product_data: {
                                name: 'P3 Lending Donation',
                                description: 'Support product development and ecosystem growth.',
                            },
                            unit_amount: Math.round(amountUsd * 100),
                        },
                        quantity: 1,
                    },
                ],
                success_url: `${frontendBaseUrl}/Thanks?donation=success&session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${frontendBaseUrl}/?deck=true&donation=cancelled`,
                customer_email: donorEmail || undefined,
                allow_promotion_codes: true,
                metadata: {
                    flow: 'donation',
                    amountUsd: amountUsd.toString(),
                    donorEmail: donorEmail || '',
                    donorName: donorName || '',
                    source: source || 'pitch_deck',
                },
                payment_intent_data: {
                    metadata: {
                        flow: 'donation',
                        source: source || 'pitch_deck',
                    },
                },
                automatic_tax: { enabled: false },
            });

            if (!session.url) {
                return res
                    .status(502)
                    .json({ success: false, error: 'Stripe did not return a checkout URL.' });
            }

            return res.status(200).json({
                success: true,
                data: {
                    checkoutUrl: session.url,
                    sessionId: session.id,
                },
            });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Stripe Session Creation Failed');
            next(error);
        }
    },

    /**
     * Handles Stripe Webhooks.
     */
    handleWebhook: async (req: Request, res: Response) => {
        const sig = req.headers['stripe-signature'] as string;
        const stripe = getStripeClient();
        let event: Stripe.Event;

        if (!stripe || !config.stripe.webhookSecret) {
            return res.status(503).json({
                received: false,
                error: 'Stripe webhook is not configured on the server.',
            });
        }

        if (!sig) {
            return res.status(400).json({ received: false, error: 'Missing Stripe signature header.' });
        }

        try {
            const rawBody = Buffer.isBuffer(req.body)
                ? req.body
                : Buffer.from(
                      typeof (req as any).rawBody === 'string'
                          ? (req as any).rawBody
                          : JSON.stringify(req.body || {})
                  );

            event = stripe.webhooks.constructEvent(
                rawBody,
                sig,
                config.stripe.webhookSecret
            );
        } catch (err: any) {
            logger.error({ error: err.message }, 'Webhook Signature Verification Failed');
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        if (event.type === 'checkout.session.completed') {
            const session = event.data.object as Stripe.Checkout.Session;
            const isDonation = session.metadata?.flow === 'donation';

            if (isDonation) {
                try {
                    await persistDonationAudit(session, event.id);
                } catch (error: any) {
                    logger.error(
                        { error: error.message, eventId: event.id, sessionId: session.id },
                        'Failed to process donation webhook'
                    );
                    return res.status(500).json({ received: true, error: 'Donation persistence failed' });
                }
            } else {
                const userId = session.metadata?.userId;
                const amount = normalizeAmount(session.metadata?.amount);
                const userEmail =
                    session.customer_details?.email ||
                    session.customer_email ||
                    session.metadata?.userEmail ||
                    undefined;

                if (userId && amount) {
                    logger.info({ userId, amount }, 'Processing successful deposit via webhook');

                    try {
                        const result = await AccountRecoveryService.processConfirmedDeposit({
                            userId,
                            depositedUsd: amount,
                            stripeEventId: event.id,
                            stripeSessionId: session.id,
                            userEmail,
                        });

                        logger.info(
                            {
                                userId,
                                depositedUsd: amount,
                                resultingBalanceUsd: result.balanceUsd,
                                autoRepaidLoanCount: result.autoRepaidLoanCount,
                                reactivated: result.reactivated,
                                alreadyProcessed: result.alreadyProcessed,
                                manualReviewRequired: result.manualReview.required,
                                manualReviewTicketId: result.manualReview.ticketId || null,
                            },
                            'Stripe deposit confirmed and processed'
                        );
                    } catch (processingError: any) {
                        logger.error(
                            { error: processingError.message, userId, stripeEventId: event.id },
                            'Failed to process confirmed deposit'
                        );
                        return res.status(500).json({ received: true, error: 'DB Update Failed' });
                    }
                }
            }
        }

        return res.json({ received: true });
    },
};
