import { supabase } from '../supabaseClient';
import { frontendEnv } from './env';
import {
  RuntimeConfigEntry,
  RuntimeConfigKey,
  RuntimeConfigService,
} from './runtimeConfigService';

type IntegrationSource = 'runtime' | 'environment' | 'fallback' | 'missing';
type AlertSeverity = 'critical' | 'warning' | 'info';

export interface AdminIntegrationStatus {
  key: RuntimeConfigKey;
  label: string;
  description: string;
  required: boolean;
  isSecret: boolean;
  inputType: 'password' | 'url' | 'text';
  source: IntegrationSource;
  effectiveValue: string;
  displayValue: string;
  runtimeEntry: RuntimeConfigEntry | null;
  statusText: string;
}

export interface AdminOpsAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  action: string;
  integrationKey?: RuntimeConfigKey;
}

export interface AdminOpsSnapshot {
  generatedAt: string;
  integrations: AdminIntegrationStatus[];
  alerts: AdminOpsAlert[];
}

interface IntegrationDefinition {
  key: RuntimeConfigKey;
  label: string;
  description: string;
  required: boolean;
  isSecret: boolean;
  inputType: 'password' | 'url' | 'text';
  envValue: string;
  fallbackValue?: string;
}

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');
const parseBooleanLike = (value: string) => ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());

const isMissingTableError = (message: string, tableName: string) => {
  const normalized = (message || '').toLowerCase();
  return (
    normalized.includes(`could not find the table 'public.${tableName}'`) ||
    normalized.includes(`relation "${tableName}" does not exist`) ||
    (normalized.includes(tableName.toLowerCase()) &&
      normalized.includes('schema cache'))
  );
};

const createIntegrationDefinitions = (): IntegrationDefinition[] => {
  const viteEnv = (import.meta as any).env || {};
  return [
    {
      key: 'GEMINI_API_KEY',
      label: 'Gemini API Key',
      description: 'Used for risk analysis and AI chat workflows.',
      required: true,
      isSecret: true,
      inputType: 'password',
      envValue: frontendEnv.VITE_API_KEY || '',
    },
    {
      key: 'COINGECKO_API_KEY',
      label: 'CoinGecko API Key',
      description: 'Used for market pricing limits and resilience.',
      required: false,
      isSecret: true,
      inputType: 'password',
      envValue: frontendEnv.VITE_COINGECKO_API_KEY || '',
    },
    {
      key: 'STRIPE_DONATE_URL',
      label: 'Stripe Donate URL',
      description: 'Used for the Donate Now CTA in the first-visit pitch deck.',
      required: true,
      isSecret: false,
      inputType: 'url',
      envValue: viteEnv.VITE_STRIPE_DONATE_URL || '',
      fallbackValue: 'https://stripe.com/payments/checkout',
    },
    {
      key: 'BACKEND_URL',
      label: 'Backend API URL',
      description: 'Used for SIWE nonce/verify requests and backend health checks.',
      required: true,
      isSecret: false,
      inputType: 'url',
      envValue: frontendEnv.VITE_BACKEND_URL || '',
    },
    {
      key: 'OPENAI_API_KEY',
      label: 'OpenAI API Key',
      description: 'Used by GPT Codex log analysis and autofix recommendations.',
      required: false,
      isSecret: true,
      inputType: 'password',
      envValue: frontendEnv.VITE_OPENAI_API_KEY || '',
    },
    {
      key: 'OPENAI_MODEL',
      label: 'OpenAI Model',
      description: 'Model name used for incident analysis (for example gpt-5-codex).',
      required: false,
      isSecret: false,
      inputType: 'text',
      envValue: frontendEnv.VITE_OPENAI_MODEL || 'gpt-5-codex',
      fallbackValue: 'gpt-5-codex',
    },
    {
      key: 'STRIPE_PAYOUTS_ENABLED',
      label: 'Stripe Payouts Enabled',
      description: 'Set to true to allow Stripe withdrawal payouts.',
      required: true,
      isSecret: false,
      inputType: 'text',
      envValue: viteEnv.VITE_STRIPE_PAYOUTS_ENABLED || '',
      fallbackValue: 'false',
    },
    {
      key: 'BTC_WITHDRAWALS_ENABLED',
      label: 'BTC Withdrawals Enabled',
      description: 'Set to true to allow BTC withdrawal execution.',
      required: true,
      isSecret: false,
      inputType: 'text',
      envValue: viteEnv.VITE_BTC_WITHDRAWALS_ENABLED || '',
      fallbackValue: 'false',
    },
    {
      key: 'BTC_WITHDRAW_PROVIDER_URL',
      label: 'BTC Provider URL',
      description: 'HTTP endpoint used to broadcast BTC withdrawals.',
      required: false,
      isSecret: false,
      inputType: 'url',
      envValue: viteEnv.VITE_BTC_WITHDRAW_PROVIDER_URL || '',
    },
    {
      key: 'BTC_WITHDRAW_PROVIDER_TOKEN',
      label: 'BTC Provider Token',
      description: 'Bearer token for BTC withdrawal provider.',
      required: false,
      isSecret: true,
      inputType: 'password',
      envValue: viteEnv.VITE_BTC_WITHDRAW_PROVIDER_TOKEN || '',
    },
    {
      key: 'PLAID_CLIENT_ID',
      label: 'Plaid Client ID',
      description: 'Plaid client identifier for bank linking and KYC/AML checks.',
      required: true,
      isSecret: true,
      inputType: 'password',
      envValue: viteEnv.VITE_PLAID_CLIENT_ID || '',
    },
    {
      key: 'PLAID_SECRET',
      label: 'Plaid Secret',
      description: 'Plaid API secret used by backend bank workflows.',
      required: true,
      isSecret: true,
      inputType: 'password',
      envValue: viteEnv.VITE_PLAID_SECRET || '',
    },
    {
      key: 'PLAID_ENV',
      label: 'Plaid Environment',
      description: 'Plaid environment (sandbox/development/production).',
      required: true,
      isSecret: false,
      inputType: 'text',
      envValue: viteEnv.VITE_PLAID_ENV || '',
      fallbackValue: 'sandbox',
    },
    {
      key: 'BETA_FEATURE_FLAGS',
      label: 'BETA Feature Flags',
      description: 'JSON object used to toggle beta behavior without redeploying.',
      required: false,
      isSecret: false,
      inputType: 'text',
      envValue: viteEnv.VITE_BETA_FEATURE_FLAGS || '',
      fallbackValue: '{}',
    },
  ];
};

const resolveIntegrationStatus = (
  definition: IntegrationDefinition
): AdminIntegrationStatus => {
  const runtimeEntry = RuntimeConfigService.getEntry(definition.key);
  const runtimeValue = runtimeEntry?.value?.trim() || '';
  const envValue = (definition.envValue || '').trim();
  const fallbackValue = (definition.fallbackValue || '').trim();

  let source: IntegrationSource = 'missing';
  let effectiveValue = '';

  if (runtimeValue) {
    source = 'runtime';
    effectiveValue = runtimeValue;
  } else if (envValue) {
    source = 'environment';
    effectiveValue = envValue;
  } else if (fallbackValue) {
    source = 'fallback';
    effectiveValue = fallbackValue;
  }

  const statusText =
    source === 'missing'
      ? 'Missing'
      : source === 'runtime'
      ? 'Configured in Admin Console'
      : source === 'environment'
      ? 'Configured in Environment'
      : 'Using Default Fallback';

  const displayValue = definition.isSecret
    ? RuntimeConfigService.maskSecret(effectiveValue)
    : effectiveValue || 'not set';

  return {
    key: definition.key,
    label: definition.label,
    description: definition.description,
    required: definition.required,
    isSecret: definition.isSecret,
    inputType: definition.inputType,
    source,
    effectiveValue,
    displayValue,
    runtimeEntry,
    statusText,
  };
};

const addKeyStateAlerts = (
  status: AdminIntegrationStatus,
  alerts: AdminOpsAlert[]
) => {
  if (status.required && status.source === 'missing') {
    alerts.push({
      id: `${status.key}-missing`,
      severity: 'critical',
      title: `${status.label} is missing`,
      detail: `${status.label} is required for production workflows.`,
      action: 'Open Operations tab and add a value.',
      integrationKey: status.key,
    });
  }

  if (status.key === 'COINGECKO_API_KEY' && status.source === 'missing') {
    alerts.push({
      id: `${status.key}-recommended`,
      severity: 'warning',
      title: 'CoinGecko API key not configured',
      detail: 'Pricing can still work, but you may hit public rate limits during traffic spikes.',
      action: 'Add a CoinGecko API key in Operations.',
      integrationKey: status.key,
    });
  }

  if (status.key === 'OPENAI_API_KEY' && status.source === 'missing') {
    alerts.push({
      id: `${status.key}-missing`,
      severity: 'warning',
      title: 'AI log analysis is disabled',
      detail: 'OpenAI API key is not configured, so GPT Codex suggestions are unavailable.',
      action: 'Add OPENAI_API_KEY in Operations.',
      integrationKey: status.key,
    });
  }

  if (status.key === 'STRIPE_DONATE_URL' && status.source === 'fallback') {
    alerts.push({
      id: `${status.key}-fallback`,
      severity: 'warning',
      title: 'Using generic Stripe donate URL',
      detail: 'The current value points to a generic Stripe checkout page.',
      action: 'Set your hosted Stripe Checkout link for accurate donation tracking.',
      integrationKey: status.key,
    });
  }

  if (
    status.key === 'STRIPE_PAYOUTS_ENABLED' &&
    !parseBooleanLike(status.effectiveValue || 'false')
  ) {
    alerts.push({
      id: `${status.key}-disabled`,
      severity: 'warning',
      title: 'Stripe payouts are disabled',
      detail: 'Stripe withdrawals cannot execute while payouts are disabled.',
      action: "Set STRIPE_PAYOUTS_ENABLED to 'true' after Stripe Connect payouts are configured.",
      integrationKey: status.key,
    });
  }

  if (
    status.key === 'BTC_WITHDRAWALS_ENABLED' &&
    parseBooleanLike(status.effectiveValue || 'false')
  ) {
    const runtime = RuntimeConfigService.getAll();
    const providerUrl = runtime.BTC_WITHDRAW_PROVIDER_URL?.value || '';
    const providerToken = runtime.BTC_WITHDRAW_PROVIDER_TOKEN?.value || '';
    if (!providerUrl || !providerToken) {
      alerts.push({
        id: 'btc-provider-missing',
        severity: 'critical',
        title: 'BTC withdrawals enabled but provider config is incomplete',
        detail: 'BTC_WITHDRAW_PROVIDER_URL and BTC_WITHDRAW_PROVIDER_TOKEN are required for live BTC withdrawals.',
        action: 'Set BTC provider URL and token in Operations.',
        integrationKey: 'BTC_WITHDRAW_PROVIDER_URL',
      });
    }
  }

  if (
    (status.key === 'PLAID_CLIENT_ID' || status.key === 'PLAID_SECRET') &&
    status.source === 'missing'
  ) {
    alerts.push({
      id: `${status.key}-missing`,
      severity: 'critical',
      title: `${status.label} is missing`,
      detail: 'Plaid bank-link and KYC/AML workflows are blocked until this value is configured.',
      action: 'Set Plaid credentials in Operations.',
      integrationKey: status.key,
    });
  }

  if (status.key === 'BETA_FEATURE_FLAGS') {
    try {
      JSON.parse(status.effectiveValue || '{}');
    } catch {
      alerts.push({
        id: 'beta-feature-flags-invalid-json',
        severity: 'warning',
        title: 'BETA feature flags JSON is invalid',
        detail: 'Feature flags fallback to defaults when JSON parsing fails.',
        action: 'Update BETA_FEATURE_FLAGS with valid JSON.',
        integrationKey: 'BETA_FEATURE_FLAGS',
      });
    }
  }

  if (status.runtimeEntry) {
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;
    if (Date.now() - status.runtimeEntry.updatedAt > ninetyDays) {
      alerts.push({
        id: `${status.key}-rotation`,
        severity: 'warning',
        title: `${status.label} rotation recommended`,
        detail: `${status.label} has not been updated in over 90 days.`,
        action: 'Use Rotate to replace the key.',
        integrationKey: status.key,
      });
    }
  }
};

const buildSeveritySort = (severity: AlertSeverity) => {
  if (severity === 'critical') return 0;
  if (severity === 'warning') return 1;
  return 2;
};

export const AdminOpsService = {
  getOperationalSnapshot: async (): Promise<AdminOpsSnapshot> => {
    const definitions = createIntegrationDefinitions();
    const integrations = definitions.map(resolveIntegrationStatus);
    const alerts: AdminOpsAlert[] = [];

    integrations.forEach((status) => addKeyStateAlerts(status, alerts));

    const backendConfig = integrations.find((item) => item.key === 'BACKEND_URL');
    if (backendConfig?.effectiveValue) {
      try {
        const healthUrl = `${trimTrailingSlash(backendConfig.effectiveValue)}/health`;
        const response = await fetch(healthUrl, { method: 'GET' });
        if (!response.ok) {
          throw new Error(`Backend health check returned ${response.status}`);
        }
        const healthPayload = await response.json().catch(() => ({}));
        const providers = healthPayload?.providers || {};
        if (providers.stripePayoutsEnabled === false) {
          alerts.push({
            id: 'backend-stripe-payouts-disabled',
            severity: 'warning',
            title: 'Backend reports Stripe payouts disabled',
            detail: 'Withdrawals to Stripe-connected accounts are currently unavailable.',
            action: 'Enable STRIPE_PAYOUTS_ENABLED and verify Stripe Connect setup.',
          });
        }
        if (providers.btcWithdrawalsEnabled === false) {
          alerts.push({
            id: 'backend-btc-withdrawals-disabled',
            severity: 'warning',
            title: 'Backend reports BTC withdrawals disabled',
            detail: 'BTC withdrawal provider is not fully configured.',
            action: 'Set BTC withdrawal provider URL/token and enable BTC withdrawals.',
          });
        }
        if (providers.plaidConfigured === false) {
          alerts.push({
            id: 'backend-plaid-missing',
            severity: 'critical',
            title: 'Backend reports Plaid is not configured',
            detail: 'Bank linking and Plaid KYC/AML flows are currently blocked.',
            action: 'Set PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV on backend environment.',
          });
        }
      } catch (error) {
        alerts.push({
          id: 'backend-health',
          severity: 'critical',
          title: 'Backend health check failed',
          detail: 'The configured backend URL did not respond to /health.',
          action: 'Update Backend API URL or restore backend service availability.',
          integrationKey: 'BACKEND_URL',
        });
      }
    }

    try {
      const { error } = await supabase
        .from('waitlist')
        .select('id', { head: true, count: 'exact' })
        .limit(1);
      if (error) {
        throw error;
      }
    } catch (error) {
      alerts.push({
        id: 'supabase-connectivity',
        severity: 'critical',
        title: 'Supabase connectivity issue detected',
        detail: 'Admin dashboard could not query waitlist data from Supabase.',
        action: 'Verify Supabase URL/anon key and RLS/policies.',
      });
    }

    try {
      const { error } = await supabase
        .from('analytics_events')
        .select('id', { head: true, count: 'exact' })
        .limit(1);
      if (error) {
        throw error;
      }
    } catch (error: any) {
      const message = String(error?.message || '');
      if (isMissingTableError(message, 'analytics_events')) {
        alerts.push({
          id: 'analytics-events-missing',
          severity: 'critical',
          title: "Supabase table 'analytics_events' is missing",
          detail:
            'Admin per-user logs rely on analytics_events and cannot load until this table exists.',
          action:
            'Run Supabase migrations 20260217021000_live_sessions_and_analytics.sql and 20260217024500_analytics_events_user_indexes.sql.',
        });
      } else {
        alerts.push({
          id: 'analytics-events-query-failed',
          severity: 'warning',
          title: 'Analytics events query failed',
          detail:
            'Admin per-user logs are currently unavailable due to a Supabase query error.',
          action: 'Review Supabase logs and table permissions for analytics_events.',
        });
      }
    }

    alerts.sort((a, b) => buildSeveritySort(a.severity) - buildSeveritySort(b.severity));

    return {
      generatedAt: new Date().toISOString(),
      integrations,
      alerts,
    };
  },
};
