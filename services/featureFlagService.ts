import { RuntimeConfigService } from './runtimeConfigService';

export type BetaFeatureFlagKey =
  | 'ENABLE_TRADING_EXECUTION'
  | 'ENABLE_WITHDRAWALS'
  | 'ENABLE_PLAID_BANKING';

export type BetaFeatureFlags = Record<BetaFeatureFlagKey, boolean>;

const DEFAULT_FLAGS: BetaFeatureFlags = {
  ENABLE_TRADING_EXECUTION: true,
  ENABLE_WITHDRAWALS: true,
  ENABLE_PLAID_BANKING: true,
};

const parseBoolean = (value: unknown, fallback: boolean) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
};

const parseFlags = (raw: string): BetaFeatureFlags => {
  if (!raw || !raw.trim()) return { ...DEFAULT_FLAGS };

  try {
    const parsed = JSON.parse(raw);
    return {
      ENABLE_TRADING_EXECUTION: parseBoolean(parsed?.ENABLE_TRADING_EXECUTION, DEFAULT_FLAGS.ENABLE_TRADING_EXECUTION),
      ENABLE_WITHDRAWALS: parseBoolean(parsed?.ENABLE_WITHDRAWALS, DEFAULT_FLAGS.ENABLE_WITHDRAWALS),
      ENABLE_PLAID_BANKING: parseBoolean(parsed?.ENABLE_PLAID_BANKING, DEFAULT_FLAGS.ENABLE_PLAID_BANKING),
    };
  } catch {
    return { ...DEFAULT_FLAGS };
  }
};

export const FeatureFlagService = {
  getFlags: (): BetaFeatureFlags => {
    const raw = RuntimeConfigService.getConfigValue('BETA_FEATURE_FLAGS');
    return parseFlags(raw);
  },

  isEnabled: (key: BetaFeatureFlagKey) => {
    return FeatureFlagService.getFlags()[key];
  },
};
