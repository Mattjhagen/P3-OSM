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
  SUPABASE_ANON_KEY: str({ desc: 'Supabase anon key for RLS-scoped user queries' }),
  SUPABASE_SERVICE_ROLE_KEY: str({ desc: 'Supabase service role key for privileged server access' }),
  COINGECKO_API_KEY: str({ default: '', desc: 'CoinGecko API key (demo/pro) for market pricing' }),
  COINGECKO_API_BASE_URL: url({ default: 'https://api.coingecko.com/api/v3' }),
  COINGECKO_CACHE_SECONDS: num({ default: 20, desc: 'In-memory CoinGecko cache TTL in seconds' }),
  TRANSACTION_FEE_PERCENT: num({ default: 0.03, desc: 'Fee percentage applied to monetized actions (for 3% use 0.03)' }),
  TRANSACTION_FEE_FIXED_USD: num({ default: 3, desc: 'Fixed USD fee added on top of percentage fee' }),
  TRADING_PROVIDER_ENABLED: bool({ default: true, desc: 'Whether backend trade execution is enabled' }),
  BTC_WITHDRAWALS_ENABLED: bool({ default: false, desc: 'Enable BTC withdrawal provider execution' }),
  BTC_WITHDRAW_PROVIDER_URL: str({ default: '', desc: 'HTTP endpoint for BTC withdrawal execution provider' }),
  BTC_WITHDRAW_PROVIDER_TOKEN: str({ default: '', desc: 'Bearer token for BTC withdrawal provider' }),
  STRIPE_PAYOUTS_ENABLED: bool({ default: false, desc: 'Enable Stripe Connect payout withdrawals' }),
  PLAID_CLIENT_ID: str({ default: '', desc: 'Plaid API client id' }),
  PLAID_SECRET: str({ default: '', desc: 'Plaid API secret' }),
  PLAID_ENV: str({ default: 'sandbox', choices: ['sandbox', 'development', 'production'] }),
  PLAID_COUNTRY_CODES: str({ default: 'US', desc: 'Comma-separated Plaid country codes (ISO-2)' }),
  PLAID_PRODUCTS: str({ default: 'auth,identity,transactions', desc: 'Comma-separated Plaid products' }),
  PLAID_REDIRECT_URI: str({ default: '', desc: 'Plaid Link redirect URI (optional)' }),
  PLAID_WEBHOOK_URL: str({ default: '', desc: 'Plaid webhook URL (optional)' }),
  SMTP_HOST: str({ default: '', desc: 'SMTP host for waitlist invitation emails' }),
  SMTP_PORT: port({ default: 587, desc: 'SMTP submission port (587 for STARTTLS)' }),
  SMTP_USER: str({ default: '', desc: 'SMTP username' }),
  SMTP_PASS: str({ default: '', desc: 'SMTP password/token' }),
  SMTP_FROM: str({ default: 'admin@p3lending.space', desc: 'Sender email address for invitations' }),
  SMTP_SECURE: bool({ default: false, desc: 'Whether to use implicit TLS (typically true for port 465)' }),
  STRIPE_SECRET_KEY: str({ default: '', desc: 'Stripe secret key for creating checkout sessions' }),
  STRIPE_WEBHOOK_SECRET: str({ default: '', desc: 'Stripe webhook signing secret' }),
  ETH_RPC_URL: str({ default: 'http://127.0.0.1:8545' }),
  P3_PROTOCOL_ADDRESS: str({ default: '0x0000000000000000000000000000000000000000' }),
});
