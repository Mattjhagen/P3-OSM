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

    alerts.sort((a, b) => buildSeveritySort(a.severity) - buildSeveritySort(b.severity));

    return {
      generatedAt: new Date().toISOString(),
      integrations,
      alerts,
    };
  },
};
