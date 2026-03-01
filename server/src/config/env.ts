import dotenv from 'dotenv';
import path from 'path';
import { bool, cleanEnv, num, port, str, url } from 'envalid';

const envPaths = [
  path.resolve(__dirname, '../../../.env.local'),
  path.resolve(__dirname, '../../../.env'),
  path.resolve(__dirname, '../../.env.local'),
  path.resolve(__dirname, '../../.env'),
];

for (const envPath of envPaths) {
  dotenv.config({ path: envPath, override: false });
}

export const validatedEnv = cleanEnv(process.env, {
  NODE_ENV: str({ default: 'development', choices: ['development', 'test', 'production'] }),
  PORT: port({ default: 5000 }),
  FRONTEND_URL: url({ default: 'http://localhost:5173', desc: 'Public frontend base URL for Stripe redirect callbacks' }),
  SUPABASE_URL: url({ desc: 'Supabase project URL for backend service operations' }),
  SUPABASE_ANON_KEY: str({
    default: '',
    desc: 'Supabase anon key for RLS-scoped user queries (optional; falls back to service role key)',
  }),
  SUPABASE_SERVICE_ROLE_KEY: str({ desc: 'Supabase service role key for privileged server access' }),
  CRYPTO_PROVIDER: str({ default: 'bitstamp', choices: ['bitstamp'] }),
  BITSTAMP_ENV: str({ default: 'prod', choices: ['sandbox', 'prod'] }),
  BITSTAMP_API_KEY: str({ default: '', desc: 'Bitstamp API key for private endpoints' }),
  BITSTAMP_API_SECRET: str({ default: '', desc: 'Bitstamp API secret for private endpoints' }),
  BITSTAMP_SUBACCOUNT_ID: str({ default: '', desc: 'Optional Bitstamp subaccount id for private calls' }),
  TRANSACTION_FEE_PERCENT: num({ default: 0.03, desc: 'Fee percentage applied to monetized actions (for 3% use 0.03)' }),
  TRANSACTION_FEE_FIXED_USD: num({ default: 3, desc: 'Fixed USD fee added on top of percentage fee' }),
  TRADING_PROVIDER_ENABLED: bool({ default: true, desc: 'Whether backend trade execution is enabled' }),
  BTC_WITHDRAWALS_ENABLED: bool({ default: false, desc: 'Enable BTC withdrawal provider execution' }),
  BTC_WITHDRAW_PROVIDER_URL: str({ default: '', desc: 'HTTP endpoint for BTC withdrawal execution provider' }),
  BTC_WITHDRAW_PROVIDER_TOKEN: str({ default: '', desc: 'Bearer token for BTC withdrawal provider' }),
  STRIPE_PAYOUTS_ENABLED: bool({ default: false, desc: 'Enable Stripe Connect payout withdrawals' }),
  STRIPE_TAX_ENABLED: bool({ default: true, desc: 'Enable Stripe Tax quote + automatic tax for service checkout' }),
  STRIPE_SERVICE_FEE_PERCENT: num({ default: 0.03, desc: 'Percent service fee for non-deposit service checkout (0.03 = 3%)' }),
  STRIPE_SERVICE_FEE_FIXED_USD: num({ default: 3, desc: 'Fixed USD fee added for non-deposit service checkout' }),
  STRIPE_SERVICE_FEE_TAXABLE: bool({ default: false, desc: 'Whether platform service fee should be included in Stripe tax calculations' }),
  STRIPE_SERVICE_DEFAULT_TAX_CODE: str({ default: '', desc: 'Optional Stripe tax code applied to service line items' }),
  STRIPE_SERVICE_CATALOG_JSON: str({ default: '', desc: 'Optional JSON object for service catalog overrides' }),
  PLAID_CLIENT_ID: str({ default: '', desc: 'Plaid API client id' }),
  PLAID_SECRET: str({ default: '', desc: 'Plaid API secret' }),
  PLAID_ENV: str({ default: 'sandbox', choices: ['sandbox', 'development', 'production'] }),
  PLAID_COUNTRY_CODES: str({ default: 'US', desc: 'Comma-separated Plaid country codes (ISO-2)' }),
  PLAID_PRODUCTS: str({ default: 'auth,identity,transactions', desc: 'Comma-separated Plaid products' }),
  PLAID_API_DATE: str({ default: '2020-09-14', desc: 'Plaid API version date header (YYYY-MM-DD)' }),
  PLAID_REDIRECT_URI: str({ default: '', desc: 'Plaid Link redirect URI (optional)' }),
  PLAID_WEBHOOK_URL: str({ default: '', desc: 'Plaid webhook URL (optional)' }),
  SMTP_HOST: str({ default: '', desc: 'SMTP host for waitlist invitation emails' }),
  SMTP_PORT: port({ default: 587, desc: 'SMTP submission port (587 for STARTTLS)' }),
  SMTP_USER: str({ default: '', desc: 'SMTP username' }),
  SMTP_PASS: str({ default: '', desc: 'SMTP password/token' }),
  SMTP_FROM: str({ default: 'admin@p3lending.space', desc: 'Sender email address for invitations' }),
  SMTP_FROM_NAME: str({ default: '', desc: 'Optional sender display name for invitation emails' }),
  SMTP_SECURE: bool({ default: false, desc: 'Whether to use implicit TLS (typically true for port 465)' }),
  ADMIN_INTERNAL_BEARER: str({
    default: '',
    desc: 'Optional internal bearer token for privileged admin waitlist endpoints',
  }),
  NETLIFY_API_TOKEN: str({ default: '', desc: 'Netlify personal access token for admin API sync jobs' }),
  NETLIFY_SITE_ID: str({ default: '', desc: 'Netlify site id used to locate waitlist forms/submissions' }),
  NETLIFY_WAITLIST_FORM_ID: str({
    default: '',
    desc: 'Optional Netlify form id to sync (preferred when known).',
  }),
  NETLIFY_WAITLIST_FORM_NAME: str({
    default: 'waitlist',
    desc: 'Netlify form name fallback for waitlist sync when form id is not set',
  }),
  STRIPE_SECRET_KEY: str({ default: '', desc: 'Stripe secret key for creating checkout sessions' }),
  STRIPE_WEBHOOK_SECRET: str({ default: '', desc: 'Stripe webhook signing secret' }),
  STRIPE_IDENTITY_ENABLED: bool({ default: true, desc: 'Enable Stripe Identity KYC/AML workflows' }),
  STRIPE_IDENTITY_REQUIRE_LIVE_CAPTURE: bool({ default: true, desc: 'Require live camera capture during Stripe Identity verification' }),
  STRIPE_IDENTITY_REQUIRE_MATCHING_SELFIE: bool({ default: true, desc: 'Require selfie match in Stripe Identity verification' }),
  STRIPE_IDENTITY_REQUIRE_ID_NUMBER: bool({ default: true, desc: 'Require ID number check in Stripe Identity verification' }),
  STRIPE_IDENTITY_ALLOWED_DOC_TYPES: str({ default: 'passport,id_card,driving_license', desc: 'Comma-separated allowed Stripe Identity document types' }),
  STRIPE_IDENTITY_VERIFICATION_FLOW_ID: str({
    default: '',
    desc: 'Optional Stripe Identity Verification Flow id (from Dashboard verification flows)',
  }),
  STATEMENT_SIGNING_SECRET: str({
    default: '',
    desc: 'Optional HMAC secret used to sign generated statements/disclosures',
  }),
  ETH_RPC_URL: str({ default: 'http://127.0.0.1:8545' }),
  P3_PROTOCOL_ADDRESS: str({ default: '0x0000000000000000000000000000000000000000' }),
  API_KEY_PEPPER: str({
    default: '',
    desc: 'Server-side secret to salt API key hashes (required for Developer API)',
  }),
  RATE_LIMIT_REDIS_URL: str({
    default: '',
    desc: 'Optional Redis URL for per-key rate limiting; if unset, Supabase table is used',
  }),
  REPUTATION_ENRICHMENT_ENABLED: bool({
    default: false,
    desc: 'Enable optional Gemini enrichment for reputation score (feature flag)',
  }),
  KYC_PROVIDER: str({
    default: 'demo',
    choices: ['openkyc', 'demo'],
    desc: 'KYC provider for investor demo: openkyc (FaceOnLive) or demo (simulated)',
  }),
  OPENKYC_BASE_URL: str({
    default: 'http://localhost:8787',
    desc: 'OpenKYC/IDKit base URL when KYC_PROVIDER=openkyc',
  }),
  OPENKYC_WEBHOOK_SECRET: str({
    default: '',
    desc: 'Webhook secret for OpenKYC callbacks (optional)',
  }),
  PUBLIC_APP_BASE_URL: str({
    default: 'http://localhost:5173',
    desc: 'Public frontend base URL for KYC redirects',
  }),
});
