import { validatedEnv } from './env';

export const config = {
    port: validatedEnv.PORT,
    frontendUrl: validatedEnv.FRONTEND_URL,
    supabase: {
        url: validatedEnv.SUPABASE_URL,
        anonKey: validatedEnv.SUPABASE_ANON_KEY,
        serviceKey: validatedEnv.SUPABASE_SERVICE_ROLE_KEY,
    },
    smtp: {
        host: validatedEnv.SMTP_HOST,
        port: validatedEnv.SMTP_PORT,
        user: validatedEnv.SMTP_USER,
        pass: validatedEnv.SMTP_PASS,
        from: validatedEnv.SMTP_FROM,
        secure: validatedEnv.SMTP_SECURE,
    },
    stripe: {
        secretKey: validatedEnv.STRIPE_SECRET_KEY,
        webhookSecret: validatedEnv.STRIPE_WEBHOOK_SECRET,
        payoutsEnabled: validatedEnv.STRIPE_PAYOUTS_ENABLED,
    },
    coingecko: {
        apiKey: validatedEnv.COINGECKO_API_KEY,
        apiBaseUrl: validatedEnv.COINGECKO_API_BASE_URL,
        cacheSeconds: validatedEnv.COINGECKO_CACHE_SECONDS,
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
    isProd: validatedEnv.NODE_ENV === 'production',
};
