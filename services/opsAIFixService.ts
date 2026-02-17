import { frontendEnv } from './env';
import { ClientLogEntry, ClientLogService } from './clientLogService';
import { RuntimeConfigKey, RuntimeConfigService } from './runtimeConfigService';

export type AIFixAction =
  | {
      type: 'update_runtime_config';
      key: RuntimeConfigKey;
      value: string;
      mode: 'set' | 'rotate';
      reason: string;
    }
  | {
      type: 'create_ticket';
      title: string;
      description: string;
      priority: 'LOW' | 'MEDIUM' | 'HIGH';
    }
  | {
      type: 'manual_step';
      instruction: string;
      reason: string;
    };

export interface OpsAIAnalysis {
  summary: string;
  probableRootCause: string;
  confidence: number;
  recommendations: string[];
  actions: AIFixAction[];
}

interface AnalyzeInput {
  logs: ClientLogEntry[];
  externalLogText: string;
  activeAlerts: Array<{ title: string; detail: string; severity: string }>;
  integrationSummary: Array<{ key: RuntimeConfigKey; status: string; source: string }>;
}

const DEFAULT_MODEL = 'gpt-5-codex';
const FALLBACK_MODEL = 'gpt-4.1-mini';

const SYSTEM_PROMPT = `You are GPT Codex acting as an SRE/incident-response engineer for P3 Lending Protocol.
Return strict JSON only with this shape:
{
  "summary": "string",
  "probableRootCause": "string",
  "confidence": number between 0 and 1,
  "recommendations": ["string"],
  "actions": [
    {
      "type": "update_runtime_config" | "create_ticket" | "manual_step",
      ...
    }
  ]
}

Rules:
- Prefer safe, reversible actions.
- If suggesting config updates, only use keys:
  GEMINI_API_KEY, COINGECKO_API_KEY, STRIPE_DONATE_URL, BACKEND_URL, OPENAI_API_KEY, OPENAI_MODEL,
  STRIPE_PAYOUTS_ENABLED, BTC_WITHDRAWALS_ENABLED, BTC_WITHDRAW_PROVIDER_URL, BTC_WITHDRAW_PROVIDER_TOKEN,
  PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV, BETA_FEATURE_FLAGS, SELL_CRYPTO_ACCOUNTS
- For update_runtime_config include: key, value, mode(set|rotate), reason.
- For create_ticket include: title, description, priority(LOW|MEDIUM|HIGH).
- For manual_step include: instruction, reason.
- Never include secrets copied from logs.
- Keep recommendations concise and practical.`;

const extractResponseText = (payload: any): string => {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const output = Array.isArray(payload?.output) ? payload.output : [];
  const segments: string[] = [];

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const block of content) {
      if (block?.type === 'output_text' && typeof block?.text === 'string') {
        segments.push(block.text);
      }
      if (block?.type === 'text' && typeof block?.text === 'string') {
        segments.push(block.text);
      }
    }
  }

  return segments.join('\n').trim();
};

const parseJson = (raw: string): any => {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const blockMatch = trimmed.match(/\{[\s\S]*\}$/);
    if (blockMatch) {
      return JSON.parse(blockMatch[0]);
    }
    throw new Error('AI output was not valid JSON');
  }
};

const normalizeConfidence = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value));
  }
  return 0.4;
};

const toSafeAnalysis = (raw: any): OpsAIAnalysis => {
  const recommendations = Array.isArray(raw?.recommendations)
    ? raw.recommendations.filter((item: unknown) => typeof item === 'string')
    : [];

  const actions: AIFixAction[] = [];
  const rawActions = Array.isArray(raw?.actions) ? raw.actions : [];

  for (const action of rawActions) {
    if (!action || typeof action !== 'object') continue;

    if (action.type === 'update_runtime_config') {
      const key = String(action.key || '') as RuntimeConfigKey;
      const validKeys: RuntimeConfigKey[] = [
        'GEMINI_API_KEY',
        'COINGECKO_API_KEY',
        'STRIPE_DONATE_URL',
        'BACKEND_URL',
        'OPENAI_API_KEY',
        'OPENAI_MODEL',
        'STRIPE_PAYOUTS_ENABLED',
        'BTC_WITHDRAWALS_ENABLED',
        'BTC_WITHDRAW_PROVIDER_URL',
        'BTC_WITHDRAW_PROVIDER_TOKEN',
        'PLAID_CLIENT_ID',
        'PLAID_SECRET',
        'PLAID_ENV',
        'BETA_FEATURE_FLAGS',
        'SELL_CRYPTO_ACCOUNTS',
      ];
      if (!validKeys.includes(key)) continue;

      actions.push({
        type: 'update_runtime_config',
        key,
        value: String(action.value || ''),
        mode: action.mode === 'rotate' ? 'rotate' : 'set',
        reason: String(action.reason || 'AI suggested configuration update'),
      });
      continue;
    }

    if (action.type === 'create_ticket') {
      actions.push({
        type: 'create_ticket',
        title: String(action.title || 'Operational follow-up'),
        description: String(action.description || 'AI suggested follow-up action.'),
        priority:
          action.priority === 'HIGH' || action.priority === 'LOW' ? action.priority : 'MEDIUM',
      });
      continue;
    }

    if (action.type === 'manual_step') {
      actions.push({
        type: 'manual_step',
        instruction: String(action.instruction || 'Review logs and investigate manually.'),
        reason: String(action.reason || 'AI flagged a manual follow-up item.'),
      });
    }
  }

  return {
    summary: String(raw?.summary || 'AI completed analysis.'),
    probableRootCause: String(raw?.probableRootCause || 'Insufficient signal for a single root cause.'),
    confidence: normalizeConfidence(raw?.confidence),
    recommendations,
    actions,
  };
};

const runResponsesRequest = async (model: string, apiKey: string, payload: AnalyzeInput) => {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: SYSTEM_PROMPT }] },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify(payload, null, 2),
            },
          ],
        },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`OpenAI request failed (${response.status}): ${errBody || 'no response body'}`);
  }

  return response.json();
};

export const OpsAIFixService = {
  analyze: async (input: AnalyzeInput): Promise<OpsAIAnalysis> => {
    const apiKey = RuntimeConfigService.getEffectiveValue(
      'OPENAI_API_KEY',
      frontendEnv.VITE_OPENAI_API_KEY || ''
    );

    if (!apiKey) {
      throw new Error('OpenAI API key is not configured. Set OPENAI_API_KEY in Operations.');
    }

    const requestedModel = RuntimeConfigService.getEffectiveValue(
      'OPENAI_MODEL',
      frontendEnv.VITE_OPENAI_MODEL || DEFAULT_MODEL
    );

    let rawResult: any;
    try {
      rawResult = await ClientLogService.withMutedCapture(() =>
        runResponsesRequest(requestedModel || DEFAULT_MODEL, apiKey, input)
      );
    } catch (error) {
      const shouldRetry =
        requestedModel !== FALLBACK_MODEL &&
        String(error).toLowerCase().includes('model');
      if (!shouldRetry) throw error;

      rawResult = await ClientLogService.withMutedCapture(() =>
        runResponsesRequest(FALLBACK_MODEL, apiKey, input)
      );
    }

    const outputText = extractResponseText(rawResult);
    if (!outputText) {
      throw new Error('AI returned an empty response.');
    }

    const parsed = parseJson(outputText);
    return toSafeAnalysis(parsed);
  },
};
