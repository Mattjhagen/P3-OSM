import { Request, Response, NextFunction } from 'express';
import Stripe from 'stripe';
import { config } from '../config/config';
import logger from '../utils/logger';
import { supabase } from '../config/supabase';
import { AccountRecoveryService } from '../services/accountRecoveryService';
import { ComplianceService } from '../services/complianceService';

const DEFAULT_FRONTEND_URL = 'https://p3lending.space';
const DONATION_AUDIT_ACTION = 'STRIPE_DONATION_COMPLETED';
const SERVICE_PAYMENT_AUDIT_ACTION = 'STRIPE_SERVICE_PAYMENT_COMPLETED';

type StripeServiceCatalogEntry = {
    serviceType: string;
    displayName: string;
    description: string;
    defaultAmountUsd: number;
    minAmountUsd: number;
    maxAmountUsd: number;
    taxCode?: string;
};

const DEFAULT_SERVICE_CATALOG: Record<string, StripeServiceCatalogEntry> = {
    loan_request_review: {
        serviceType: 'loan_request_review',
        displayName: 'Loan Request Review',
        description: 'Priority underwriting and eligibility review for lending workflows.',
        defaultAmountUsd: 49,
        minAmountUsd: 5,
        maxAmountUsd: 25000,
    },
    risk_assessment: {
        serviceType: 'risk_assessment',
        displayName: 'Risk Assessment',
        description: 'Enhanced risk analysis and compliance screening service.',
        defaultAmountUsd: 79,
        minAmountUsd: 5,
        maxAmountUsd: 25000,
    },
    kyc_aml_verification: {
        serviceType: 'kyc_aml_verification',
        displayName: 'KYC/AML Verification',
        description: 'Identity verification and compliance checks.',
        defaultAmountUsd: 29,
        minAmountUsd: 5,
        maxAmountUsd: 25000,
    },
    concierge_support: {
        serviceType: 'concierge_support',
        displayName: 'Concierge Support',
        description: 'Direct support and onboarding services.',
        defaultAmountUsd: 39,
        minAmountUsd: 5,
        maxAmountUsd: 25000,
    },
};

const SERVICE_TYPE_ALIASES: Record<string, string> = {
    loan_request: 'loan_request_review',
    loan_requests: 'loan_request_review',
    underwriting: 'loan_request_review',
    risk: 'risk_assessment',
    risk_review: 'risk_assessment',
    kyc: 'kyc_aml_verification',
    aml: 'kyc_aml_verification',
    support: 'concierge_support',
    concierge: 'concierge_support',
};

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

const roundUsd = (value: number) => Math.round(value * 100) / 100;
const toCents = (value: number) => Math.round(Math.max(0, value) * 100);

const normalizeServiceType = (value: unknown) => {
    const raw = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    if (!raw) return '';
    return SERVICE_TYPE_ALIASES[raw] || raw;
};

const resolveServiceCatalog = (): Record<string, StripeServiceCatalogEntry> => {
    const base: Record<string, StripeServiceCatalogEntry> = { ...DEFAULT_SERVICE_CATALOG };
    const raw = String(config.stripe.serviceCatalogJson || '').trim();
    if (!raw) return base;

    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return base;

        for (const [key, value] of Object.entries(parsed as Record<string, any>)) {
            const normalizedType = normalizeServiceType(key);
            if (!normalizedType || !value || typeof value !== 'object') continue;

            const defaultAmountUsd = normalizeAmount(value.defaultAmountUsd);
            const minAmountUsd = normalizeAmount(value.minAmountUsd);
            const maxAmountUsd = normalizeAmount(value.maxAmountUsd);

            if (!defaultAmountUsd || !minAmountUsd || !maxAmountUsd) continue;
            if (maxAmountUsd < minAmountUsd) continue;

            base[normalizedType] = {
                serviceType: normalizedType,
                displayName: String(value.displayName || normalizedType).trim() || normalizedType,
                description: String(value.description || '').trim() || 'Stripe service checkout.',
                defaultAmountUsd,
                minAmountUsd,
                maxAmountUsd,
                taxCode: String(value.taxCode || '').trim() || undefined,
            };
        }
    } catch (error: any) {
        logger.warn(
            { error: error?.message || String(error) },
            'Invalid STRIPE_SERVICE_CATALOG_JSON. Falling back to default service catalog.'
        );
    }

    return base;
};

const resolveServiceEntry = (serviceTypeRaw: unknown): StripeServiceCatalogEntry | null => {
    const serviceType = normalizeServiceType(serviceTypeRaw);
    if (!serviceType) return null;
    const catalog = resolveServiceCatalog();
    return catalog[serviceType] || null;
};

const normalizeAddress = (value: any) => {
    if (!value || typeof value !== 'object') return null;
    const country = String(value.country || '')
        .trim()
        .toUpperCase();
    if (country.length !== 2) return null;

    return {
        country,
        postal_code: String(value.postalCode || value.postal_code || '').trim() || undefined,
        state: String(value.state || '').trim() || undefined,
        city: String(value.city || '').trim() || undefined,
        line1: String(value.line1 || '').trim() || undefined,
        line2: String(value.line2 || '').trim() || undefined,
    };
};

const buildServiceTotals = (baseAmountUsd: number) => {
    const feePercent =
        Number.isFinite(config.stripe.serviceFeePercent) && config.stripe.serviceFeePercent >= 0
            ? config.stripe.serviceFeePercent
            : 0;
    const feeFixedUsd =
        Number.isFinite(config.stripe.serviceFeeFixedUsd) && config.stripe.serviceFeeFixedUsd >= 0
            ? config.stripe.serviceFeeFixedUsd
            : 0;
    const serviceFeeUsd = roundUsd(baseAmountUsd * feePercent + feeFixedUsd);
    return {
        baseAmountUsd: roundUsd(baseAmountUsd),
        serviceFeeUsd,
        subtotalUsd: roundUsd(baseAmountUsd + serviceFeeUsd),
        feePercent,
        feeFixedUsd,
    };
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

const persistServicePaymentAudit = async (session: Stripe.Checkout.Session, eventId: string) => {
    const serviceType = String(session.metadata?.serviceType || '').trim();
    const baseAmountUsd = normalizeAmount(session.metadata?.baseAmountUsd);
    const serviceFeeUsd = normalizeAmount(session.metadata?.serviceFeeUsd) || 0;
    const subtotalUsd = normalizeAmount(session.metadata?.subtotalUsd) || 0;
    const taxUsd =
        typeof session.total_details?.amount_tax === 'number'
            ? roundUsd(session.total_details.amount_tax / 100)
            : 0;
    const totalUsd =
        typeof session.amount_total === 'number'
            ? roundUsd(session.amount_total / 100)
            : roundUsd(subtotalUsd + taxUsd);
    const userId = String(session.metadata?.userId || '').trim() || null;
    const customerEmail =
        session.customer_details?.email || session.customer_email || session.metadata?.customerEmail || null;
    const paymentIntentId =
        typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id || null;

    const { error } = await supabase.from('audit_log').insert({
        actor_id: userId,
        action: SERVICE_PAYMENT_AUDIT_ACTION,
        resource_type: 'service_payment',
        metadata: {
            stripe_event_id: eventId,
            stripe_session_id: session.id,
            stripe_payment_intent_id: paymentIntentId,
            service_type: serviceType,
            base_amount_usd: baseAmountUsd || 0,
            service_fee_usd: serviceFeeUsd,
            subtotal_usd: subtotalUsd,
            tax_usd: taxUsd,
            total_usd: totalUsd,
            currency: (session.currency || 'usd').toUpperCase(),
            customer_email: customerEmail,
            payment_status: session.payment_status || 'unknown',
            livemode: Boolean(session.livemode),
        },
    });

    if (error) {
        throw new Error(`Failed to persist service payment audit log: ${error.message}`);
    }
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
     * Returns available Stripe service checkout catalog + active fee policy.
     */
    getServiceCatalog: async (_req: Request, res: Response) => {
        const catalog = Object.values(resolveServiceCatalog()).map((entry) => ({
            ...entry,
            taxCode: entry.taxCode || config.stripe.serviceDefaultTaxCode || null,
        }));

        return res.status(200).json({
            success: true,
            data: {
                services: catalog,
                stripeTaxEnabled: Boolean(config.stripe.taxEnabled),
                serviceFeePolicy: {
                    percent: config.stripe.serviceFeePercent,
                    fixedUsd: config.stripe.serviceFeeFixedUsd,
                    feeTaxable: config.stripe.serviceFeeTaxable,
                },
            },
        });
    },

    /**
     * Creates a Stripe Tax quote for a given service checkout request.
     */
    createServiceTaxQuote: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const stripe = getStripeClient();
            const serviceEntry = resolveServiceEntry(req.body?.serviceType);
            const requestedAmountUsd = normalizeAmount(req.body?.amountUsd);
            const customerAddress = normalizeAddress(req.body?.customerAddress);

            if (!serviceEntry) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid serviceType. Call GET /api/payments/services/catalog for valid values.',
                });
            }

            const baseAmountUsd = requestedAmountUsd || serviceEntry.defaultAmountUsd;
            if (baseAmountUsd < serviceEntry.minAmountUsd || baseAmountUsd > serviceEntry.maxAmountUsd) {
                return res.status(400).json({
                    success: false,
                    error: `amountUsd must be between ${serviceEntry.minAmountUsd} and ${serviceEntry.maxAmountUsd} for ${serviceEntry.serviceType}.`,
                });
            }

            if (!customerAddress) {
                return res.status(400).json({
                    success: false,
                    error: 'customerAddress.country (ISO-2) is required for tax quote.',
                });
            }

            if (!stripe) {
                return res.status(503).json({
                    success: false,
                    error: 'Stripe is not configured on the server. Please add STRIPE_SECRET_KEY to .env',
                });
            }

            if (!config.stripe.taxEnabled) {
                return res.status(503).json({
                    success: false,
                    error: 'Stripe tax quoting is disabled. Set STRIPE_TAX_ENABLED=true.',
                });
            }

            const totals = buildServiceTotals(baseAmountUsd);
            const taxCode = serviceEntry.taxCode || config.stripe.serviceDefaultTaxCode || undefined;

            const lineItems: Stripe.Tax.CalculationCreateParams.LineItem[] = [
                {
                    amount: toCents(totals.baseAmountUsd),
                    reference: `${serviceEntry.serviceType}:base`,
                    tax_behavior: 'exclusive',
                    tax_code: taxCode,
                },
            ];

            if (totals.serviceFeeUsd > 0 && config.stripe.serviceFeeTaxable) {
                lineItems.push({
                    amount: toCents(totals.serviceFeeUsd),
                    reference: `${serviceEntry.serviceType}:service_fee`,
                    tax_behavior: 'exclusive',
                    tax_code: taxCode,
                });
            }

            const calculation = await stripe.tax.calculations.create({
                currency: 'usd',
                customer_details: {
                    address: customerAddress,
                    address_source: 'billing',
                },
                line_items: lineItems,
            });

            const taxableSubtotalUsd = roundUsd(
                totals.baseAmountUsd + (config.stripe.serviceFeeTaxable ? totals.serviceFeeUsd : 0)
            );
            const taxableSubtotalCents = toCents(taxableSubtotalUsd);
            const taxableTotalCents = Number(calculation.amount_total || taxableSubtotalCents);
            const taxCents = Number(calculation.tax_amount_exclusive || 0);
            const nonTaxableServiceFeeUsd = config.stripe.serviceFeeTaxable ? 0 : totals.serviceFeeUsd;
            const grandTotalUsd = roundUsd(taxableTotalCents / 100 + nonTaxableServiceFeeUsd);

            return res.status(200).json({
                success: true,
                data: {
                    calculationId: calculation.id,
                    serviceType: serviceEntry.serviceType,
                    displayName: serviceEntry.displayName,
                    currency: 'USD',
                    baseAmountUsd: totals.baseAmountUsd,
                    serviceFeeUsd: totals.serviceFeeUsd,
                    subtotalUsd: roundUsd(taxableSubtotalUsd + nonTaxableServiceFeeUsd),
                    taxUsd: roundUsd(taxCents / 100),
                    totalUsd: grandTotalUsd,
                    feePolicy: {
                        percent: totals.feePercent,
                        fixedUsd: totals.feeFixedUsd,
                        feeTaxable: config.stripe.serviceFeeTaxable,
                    },
                },
            });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Stripe service tax quote failed');
            next(error);
        }
    },

    /**
     * Creates a Stripe Checkout Session for billable platform services with automatic tax.
     */
    createServiceCheckoutSession: async (req: Request, res: Response, next: NextFunction) => {
        try {
            const stripe = getStripeClient();
            const frontendBaseUrl = resolveFrontendBaseUrl(req);
            const serviceEntry = resolveServiceEntry(req.body?.serviceType);
            const requestedAmountUsd = normalizeAmount(req.body?.amountUsd);
            const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
            const userEmail = typeof req.body?.userEmail === 'string' ? req.body.userEmail.trim() : '';
            const source = typeof req.body?.source === 'string' ? req.body.source.trim() : 'service_checkout';

            if (!serviceEntry) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid serviceType. Call GET /api/payments/services/catalog for valid values.',
                });
            }

            const baseAmountUsd = requestedAmountUsd || serviceEntry.defaultAmountUsd;
            if (baseAmountUsd < serviceEntry.minAmountUsd || baseAmountUsd > serviceEntry.maxAmountUsd) {
                return res.status(400).json({
                    success: false,
                    error: `amountUsd must be between ${serviceEntry.minAmountUsd} and ${serviceEntry.maxAmountUsd} for ${serviceEntry.serviceType}.`,
                });
            }

            if (!stripe) {
                return res.status(503).json({
                    success: false,
                    error: 'Stripe is not configured on the server. Please add STRIPE_SECRET_KEY to .env',
                });
            }

            const totals = buildServiceTotals(baseAmountUsd);
            const taxCode = serviceEntry.taxCode || config.stripe.serviceDefaultTaxCode || undefined;
            const serviceFeeDescription = `${(totals.feePercent * 100).toFixed(2)}% + $${totals.feeFixedUsd.toFixed(2)}`;

            const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
                {
                    quantity: 1,
                    price_data: {
                        currency: 'usd',
                        unit_amount: toCents(totals.baseAmountUsd),
                        tax_behavior: 'exclusive',
                        product_data: {
                            name: serviceEntry.displayName,
                            description: serviceEntry.description,
                            tax_code: taxCode,
                        },
                    },
                },
            ];

            if (totals.serviceFeeUsd > 0) {
                lineItems.push({
                    quantity: 1,
                    price_data: {
                        currency: 'usd',
                        unit_amount: toCents(totals.serviceFeeUsd),
                        tax_behavior: 'exclusive',
                        product_data: {
                            name: 'P3 Platform Service Fee',
                            description: `Applied fee policy: ${serviceFeeDescription}`,
                            tax_code: config.stripe.serviceFeeTaxable ? taxCode : undefined,
                        },
                    },
                });
            }

            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                mode: 'payment',
                line_items: lineItems,
                allow_promotion_codes: true,
                billing_address_collection: 'required',
                automatic_tax: { enabled: Boolean(config.stripe.taxEnabled) },
                success_url: `${frontendBaseUrl}/profile?service=success&session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${frontendBaseUrl}/profile?service=cancelled`,
                customer_email: userEmail || undefined,
                metadata: {
                    flow: 'service',
                    serviceType: serviceEntry.serviceType,
                    userId,
                    userEmail,
                    source,
                    baseAmountUsd: totals.baseAmountUsd.toFixed(2),
                    serviceFeeUsd: totals.serviceFeeUsd.toFixed(2),
                    subtotalUsd: totals.subtotalUsd.toFixed(2),
                    feePercent: totals.feePercent.toFixed(6),
                    feeFixedUsd: totals.feeFixedUsd.toFixed(2),
                },
                payment_intent_data: {
                    metadata: {
                        flow: 'service',
                        serviceType: serviceEntry.serviceType,
                        source,
                        userId,
                    },
                },
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
                    serviceType: serviceEntry.serviceType,
                    baseAmountUsd: totals.baseAmountUsd,
                    serviceFeeUsd: totals.serviceFeeUsd,
                    subtotalUsd: totals.subtotalUsd,
                },
            });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Stripe service checkout session creation failed');
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
            const flow = String(session.metadata?.flow || '').trim();
            const isDonation = flow === 'donation';
            const isService = flow === 'service';
            const isDeveloper = flow === 'developer';

            if (isDeveloper) {
                const userId = session.metadata?.userId;
                const planTier = String(session.metadata?.plan || 'launch').toLowerCase();
                if (!userId) {
                    logger.warn({ sessionId: session.id }, 'Developer checkout missing userId in metadata');
                } else {
                    try {
                        const stripe = getStripeClient();
                        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null;
                        let customerId = session.customer as string | null;
                        let periodStart: Date | null = null;
                        let periodEnd: Date | null = null;

                        if (stripe && subscriptionId) {
                            const sub = (await stripe.subscriptions.retrieve(subscriptionId)) as Stripe.Subscription;
                            customerId = sub.customer as string;
                            periodStart = sub.current_period_start ? new Date(sub.current_period_start * 1000) : null;
                            periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;
                        }

                        const monthlyLimits: Record<string, number> = {
                            launch: 5_000,
                            core: 20_000,
                            grow: 1_000_000,
                        };
                        const monthlyLimit = monthlyLimits[planTier] ?? 5_000;

                        const { data: members } = await supabase
                            .from('org_members')
                            .select('org_id')
                            .eq('user_id', userId)
                            .in('role', ['owner', 'admin'])
                            .limit(1);
                        let orgId = members?.[0]?.org_id;
                        if (!orgId) {
                            const { data: org } = await supabase
                                .from('orgs')
                                .insert({ name: 'My Organization', owner_user_id: userId })
                                .select('id')
                                .single();
                            if (org?.id) {
                                orgId = org.id;
                                await supabase.from('org_members').insert({ org_id: orgId, user_id: userId, role: 'owner' });
                            }
                        }
                        if (orgId) {
                            const { error: upsertErr } = await supabase.from('org_plans').upsert(
                                {
                                    org_id: orgId,
                                    plan: 'paid',
                                    status: 'active',
                                    stripe_customer_id: customerId,
                                    stripe_subscription_id: subscriptionId,
                                    current_period_start: periodStart?.toISOString() ?? null,
                                    current_period_end: periodEnd?.toISOString() ?? null,
                                    monthly_limit: monthlyLimit,
                                    updated_at: new Date().toISOString(),
                                },
                                { onConflict: 'org_id' }
                            );
                            if (upsertErr) {
                                logger.error({ error: upsertErr.message, orgId, userId }, 'Failed to upsert org_plans');
                                throw upsertErr;
                            }
                            logger.info({ orgId, userId, planTier, subscriptionId }, 'Developer plan activated via webhook');
                        }
                    } catch (devErr: any) {
                        logger.error(
                            { error: devErr.message, eventId: event.id, sessionId: session.id },
                            'Failed to process developer subscription webhook'
                        );
                        return res.status(500).json({ received: true, error: 'Developer plan persistence failed' });
                    }
                }
            } else if (isDonation) {
                try {
                    await persistDonationAudit(session, event.id);
                } catch (error: any) {
                    logger.error(
                        { error: error.message, eventId: event.id, sessionId: session.id },
                        'Failed to process donation webhook'
                    );
                    return res.status(500).json({ received: true, error: 'Donation persistence failed' });
                }
            } else if (isService) {
                try {
                    await persistServicePaymentAudit(session, event.id);
                } catch (error: any) {
                    logger.error(
                        { error: error.message, eventId: event.id, sessionId: session.id },
                        'Failed to process service payment webhook'
                    );
                    return res.status(500).json({ received: true, error: 'Service payment persistence failed' });
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
