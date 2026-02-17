export type RuntimeConfigKey =
  | 'GEMINI_API_KEY'
  | 'COINGECKO_API_KEY'
  | 'STRIPE_DONATE_URL'
  | 'BACKEND_URL'
  | 'OPENAI_API_KEY'
  | 'OPENAI_MODEL'
  | 'STRIPE_PAYOUTS_ENABLED'
  | 'BTC_WITHDRAWALS_ENABLED'
  | 'BTC_WITHDRAW_PROVIDER_URL'
  | 'BTC_WITHDRAW_PROVIDER_TOKEN'
  | 'PLAID_CLIENT_ID'
  | 'PLAID_SECRET'
  | 'PLAID_ENV'
  | 'BETA_FEATURE_FLAGS';

export interface RuntimeConfigEntry {
  value: string;
  updatedAt: number;
  updatedBy: string;
  rotationCount: number;
}

type RuntimeConfigStore = Partial<Record<RuntimeConfigKey, RuntimeConfigEntry>>;

const STORAGE_KEY = 'p3_runtime_config_v1';
const VALID_KEYS: RuntimeConfigKey[] = [
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
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getStorage = (): Storage | null => {
  if (typeof window === 'undefined') return null;
  if (!window.localStorage) return null;
  return window.localStorage;
};

const normalizeValue = (value: string) => value.trim();

const isValidKey = (key: string): key is RuntimeConfigKey =>
  VALID_KEYS.includes(key as RuntimeConfigKey);

const readStore = (): RuntimeConfigStore => {
  const storage = getStorage();
  if (!storage) return {};

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return {};

    const store: RuntimeConfigStore = {};

    for (const [key, value] of Object.entries(parsed)) {
      if (!isValidKey(key) || !isRecord(value)) continue;
      if (typeof value.value !== 'string') continue;

      store[key] = {
        value: normalizeValue(value.value),
        updatedAt:
          typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
            ? value.updatedAt
            : Date.now(),
        updatedBy: typeof value.updatedBy === 'string' && value.updatedBy
          ? value.updatedBy
          : 'unknown',
        rotationCount:
          typeof value.rotationCount === 'number' && Number.isFinite(value.rotationCount)
            ? Math.max(0, Math.floor(value.rotationCount))
            : 0,
      };
    }

    return store;
  } catch {
    return {};
  }
};

const writeStore = (store: RuntimeConfigStore) => {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(store));
};

export const RuntimeConfigService = {
  getAll: (): RuntimeConfigStore => readStore(),

  getEntry: (key: RuntimeConfigKey): RuntimeConfigEntry | null => {
    const entry = readStore()[key];
    return entry || null;
  },

  getConfigValue: (key: RuntimeConfigKey): string => {
    const entry = RuntimeConfigService.getEntry(key);
    return entry ? normalizeValue(entry.value) : '';
  },

  getEffectiveValue: (key: RuntimeConfigKey, envFallback: string): string => {
    const runtimeValue = RuntimeConfigService.getConfigValue(key);
    if (runtimeValue) return runtimeValue;
    return normalizeValue(envFallback || '');
  },

  setConfigValue: (key: RuntimeConfigKey, value: string, updatedBy: string) => {
    const nextValue = normalizeValue(value);
    const store = readStore();
    const previous = store[key];

    store[key] = {
      value: nextValue,
      updatedAt: Date.now(),
      updatedBy: updatedBy || 'admin',
      rotationCount: previous?.rotationCount || 0,
    };

    writeStore(store);
    return store[key] as RuntimeConfigEntry;
  },

  rotateConfigValue: (key: RuntimeConfigKey, value: string, updatedBy: string) => {
    const nextValue = normalizeValue(value);
    const store = readStore();
    const previous = store[key];

    store[key] = {
      value: nextValue,
      updatedAt: Date.now(),
      updatedBy: updatedBy || 'admin',
      rotationCount: (previous?.rotationCount || 0) + 1,
    };

    writeStore(store);
    return store[key] as RuntimeConfigEntry;
  },

  clearConfigValue: (key: RuntimeConfigKey) => {
    const store = readStore();
    delete store[key];
    writeStore(store);
  },

  maskSecret: (value: string) => {
    const normalized = normalizeValue(value);
    if (!normalized) return 'not set';
    if (normalized.length <= 4) return '****';
    return `****${normalized.slice(-4)}`;
  },
};
