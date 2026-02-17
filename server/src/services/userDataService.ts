import { supabase } from '../config/supabase';

export interface PortfolioHolding {
  assetId: string;
  symbol: string;
  amount: number;
  avgBuyPrice: number;
}

export interface MutableUserFinanceProfile {
  id: string;
  email?: string;
  balance: number;
  portfolio: PortfolioHolding[];
  [key: string]: unknown;
}

const roundUsd = (value: number) => Math.round(value * 100) / 100;

const normalizeHolding = (raw: any): PortfolioHolding | null => {
  const symbol = String(raw?.symbol || '').trim().toUpperCase();
  const assetId = String(raw?.assetId || '').trim();
  const amount = Number(raw?.amount || 0);
  const avgBuyPrice = Number(raw?.avgBuyPrice || 0);

  if (!symbol || !assetId) return null;
  if (!Number.isFinite(amount) || amount < 0) return null;
  if (!Number.isFinite(avgBuyPrice) || avgBuyPrice < 0) return null;

  return {
    assetId,
    symbol,
    amount,
    avgBuyPrice,
  };
};

const normalizeProfile = (userId: string, email: string | undefined, data: any): MutableUserFinanceProfile => {
  const source = typeof data === 'object' && data !== null ? { ...data } : {};
  const rawPortfolio = Array.isArray(source.portfolio) ? source.portfolio : [];

  const portfolio = rawPortfolio
    .map(normalizeHolding)
    .filter((item: PortfolioHolding | null): item is PortfolioHolding => Boolean(item));

  const balance = Number(source.balance || 0);

  return {
    ...source,
    id: userId,
    email: email || source.email || undefined,
    balance: Number.isFinite(balance) ? roundUsd(balance) : 0,
    portfolio,
  };
};

export const UserDataService = {
  async getProfile(userId: string): Promise<MutableUserFinanceProfile> {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, data')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch user profile: ${error.message}`);
    }

    if (!data) {
      throw new Error(`User '${userId}' not found.`);
    }

    return normalizeProfile(data.id, data.email || undefined, data.data);
  },

  async updateProfile(
    userId: string,
    updater: (profile: MutableUserFinanceProfile) => MutableUserFinanceProfile
  ): Promise<MutableUserFinanceProfile> {
    const current = await this.getProfile(userId);
    const next = updater(current);

    const payload = {
      ...next,
      id: userId,
      email: next.email || current.email || undefined,
      balance: roundUsd(Number(next.balance || 0)),
      portfolio: Array.isArray(next.portfolio)
        ? next.portfolio
            .map(normalizeHolding)
            .filter((item: PortfolioHolding | null): item is PortfolioHolding => Boolean(item))
        : current.portfolio,
    };

    if (payload.balance < 0) {
      throw new Error('Negative balances are not allowed.');
    }

    const { error } = await supabase
      .from('users')
      .update({ data: payload })
      .eq('id', userId);

    if (error) {
      throw new Error(`Failed to persist user profile: ${error.message}`);
    }

    return payload;
  },
};
