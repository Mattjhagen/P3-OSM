import { validatedEnv } from './env';

export const config = {
    port: validatedEnv.PORT,
    frontendUrl: validatedEnv.FRONTEND_URL,
    supabase: {
        url: validatedEnv.SUPABASE_URL,
        anonKey: validatedEnv.SUPABASE_ANON_KEY || validatedEnv.SUPABASE_SERVICE_ROLE_KEY,
        serviceKey: validatedEnv.SUPABASE_SERVICE_ROLE_KEY,
    },
    smtp: {
        host: validatedEnv.SMTP_HOST,
        port: validatedEnv.SMTP_PORT,
        user: validatedEnv.SMTP_USER,
        pass: validatedEnv.SMTP_PASS,
        from: validatedEnv.SMTP_FROM,
        fromName: validatedEnv.SMTP_FROM_NAME,
        secure: validatedEnv.SMTP_SECURE,
    },
    admin: {
        internalBearer: validatedEnv.ADMIN_INTERNAL_BEARER,
    },
    netlify: {
        apiToken: validatedEnv.NETLIFY_API_TOKEN,
        siteId: validatedEnv.NETLIFY_SITE_ID,
        waitlistFormId: validatedEnv.NETLIFY_WAITLIST_FORM_ID.trim(),
        waitlistFormName: validatedEnv.NETLIFY_WAITLIST_FORM_NAME.trim() || 'waitlist',
    },
    stripe: {
        secretKey: validatedEnv.STRIPE_SECRET_KEY,
        webhookSecret: validatedEnv.STRIPE_WEBHOOK_SECRET,
        payoutsEnabled: validatedEnv.STRIPE_PAYOUTS_ENABLED,
        taxEnabled: validatedEnv.STRIPE_TAX_ENABLED,
        serviceFeePercent: validatedEnv.STRIPE_SERVICE_FEE_PERCENT,
        serviceFeeFixedUsd: validatedEnv.STRIPE_SERVICE_FEE_FIXED_USD,
        serviceFeeTaxable: validatedEnv.STRIPE_SERVICE_FEE_TAXABLE,
        serviceDefaultTaxCode: validatedEnv.STRIPE_SERVICE_DEFAULT_TAX_CODE,
        serviceCatalogJson: validatedEnv.STRIPE_SERVICE_CATALOG_JSON,
        identity: {
            enabled: validatedEnv.STRIPE_IDENTITY_ENABLED,
            requireLiveCapture: validatedEnv.STRIPE_IDENTITY_REQUIRE_LIVE_CAPTURE,
            requireMatchingSelfie: validatedEnv.STRIPE_IDENTITY_REQUIRE_MATCHING_SELFIE,
            requireIdNumber: validatedEnv.STRIPE_IDENTITY_REQUIRE_ID_NUMBER,
            allowedDocTypes: validatedEnv.STRIPE_IDENTITY_ALLOWED_DOC_TYPES
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean),
            verificationFlowId: validatedEnv.STRIPE_IDENTITY_VERIFICATION_FLOW_ID.trim(),
        },
    },
    compliance: {
        statementSigningSecret: validatedEnv.STATEMENT_SIGNING_SECRET,
    },
    crypto: {
        provider: validatedEnv.CRYPTO_PROVIDER,
        bitstamp: {
            env: validatedEnv.BITSTAMP_ENV,
            apiKey: validatedEnv.BITSTAMP_API_KEY,
            apiSecret: validatedEnv.BITSTAMP_API_SECRET,
            subaccountId: validatedEnv.BITSTAMP_SUBACCOUNT_ID.trim(),
        },
    },
    fees: {
        percent: validatedEnv.TRANSACTION_FEE_PERCENT,
        fixedUsd: validatedEnv.TRANSACTION_FEE_FIXED_USD,
    },
    trading: {
        providerEnabled: validatedEnv.TRADING_PROVIDER_ENABLED,
    },
    withdrawals: {
        btcEnabled: validatedEnv.BTC_WITHDRAWALS_ENABLED,
        btcProviderUrl: validatedEnv.BTC_WITHDRAW_PROVIDER_URL,
        btcProviderToken: validatedEnv.BTC_WITHDRAW_PROVIDER_TOKEN,
    },
    plaid: {
        clientId: validatedEnv.PLAID_CLIENT_ID,
        secret: validatedEnv.PLAID_SECRET,
        env: validatedEnv.PLAID_ENV,
        countryCodes: validatedEnv.PLAID_COUNTRY_CODES
            .split(',')
            .map((item) => item.trim().toUpperCase())
            .filter(Boolean),
        products: validatedEnv.PLAID_PRODUCTS
            .split(',')
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean),
        redirectUri: validatedEnv.PLAID_REDIRECT_URI,
        webhookUrl: validatedEnv.PLAID_WEBHOOK_URL,
    },
    ethereum: {
        rpcUrl: validatedEnv.ETH_RPC_URL,
        contractAddress: validatedEnv.P3_PROTOCOL_ADDRESS,
    },
    developerApi: {
        apiKeyPepper: validatedEnv.API_KEY_PEPPER,
        rateLimitRedisUrl: validatedEnv.RATE_LIMIT_REDIS_URL,
        reputationEnrichmentEnabled: validatedEnv.REPUTATION_ENRICHMENT_ENABLED,
        anthropicApiKey: validatedEnv.ANTHROPIC_API_KEY,
    },
    kyc: {
        provider: validatedEnv.KYC_PROVIDER,
        openkycBaseUrl: validatedEnv.OPENKYC_BASE_URL.replace(/\/+$/, ''),
        openkycWebhookSecret: validatedEnv.OPENKYC_WEBHOOK_SECRET,
        publicAppBaseUrl: validatedEnv.PUBLIC_APP_BASE_URL.replace(/\/+$/, ''),
    },
    isProd: validatedEnv.NODE_ENV === 'production',
};
