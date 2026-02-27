/**
 * Developer API: authenticate requests via Bearer API key.
 * Key format: p3_live_<random> or p3_test_<random>. Store only key_prefix + key_hash in DB.
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { supabase } from '../config/supabase';
import { config } from '../config/config';

const PREFIX_LEN = 20; // p3_live_ (8) + 12 chars of random for lookup
const DEFAULT_LIMITS = {
  sandbox: { monthly: 5_000 },
  paid: { monthly: 1_000_000 },
} as const;

function parseBearer(header: string | undefined): string | null {
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function deriveEnv(rawKey: string, storedEnv?: string | null): 'test' | 'live' {
  if (rawKey.startsWith('p3_test_')) return 'test';
  if (rawKey.startsWith('p3_live_')) return 'live';
  return storedEnv === 'test' ? 'test' : 'live';
}

function extractPrefix(rawKey: string): string {
  if (rawKey.length <= PREFIX_LEN) return rawKey;
  return rawKey.slice(0, PREFIX_LEN);
}

function hashKey(rawKey: string, pepper: string): string {
  return crypto.createHash('sha256').update(rawKey + pepper).digest('hex');
}

export async function apiKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const pepper = config.developerApi.apiKeyPepper;
  if (!pepper) {
    res.status(503).json({ success: false, error: 'Developer API is not configured.' });
    return;
  }

  const rawKey = parseBearer(req.header('authorization'));
  if (!rawKey) {
    res.status(401).json({ success: false, error: 'Missing or invalid Authorization header. Use Bearer <api_key>.' });
    return;
  }

  const prefix = extractPrefix(rawKey);
  const { data: row, error } = await supabase
    .from('api_keys')
    .select('id, org_id, key_prefix, key_hash, scopes, status, rpm_limit, rpd_limit, env, monthly_limit_override')
    .eq('key_prefix', prefix)
    .eq('status', 'active')
    .maybeSingle();

  if (error || !row) {
    res.status(401).json({ success: false, error: 'Invalid API key.' });
    return;
  }

  const expectedHash = hashKey(rawKey, pepper);
  if (!crypto.timingSafeEqual(Buffer.from(row.key_hash, 'utf8'), Buffer.from(expectedHash, 'utf8'))) {
    res.status(401).json({ success: false, error: 'Invalid API key.' });
    return;
  }

  const env = deriveEnv(rawKey, row.env);

  const { data: planRow } = await supabase
    .from('org_plans')
    .select('plan, status, monthly_limit, current_period_start, current_period_end')
    .eq('org_id', row.org_id)
    .maybeSingle();

  const plan = (planRow?.plan === 'paid' ? 'paid' : 'sandbox') as 'sandbox' | 'paid';
  const planStatus = (planRow?.status === 'past_due'
    ? 'past_due'
    : planRow?.status === 'canceled'
      ? 'canceled'
      : 'active') as 'active' | 'past_due' | 'canceled';

  const planMonthly = Number(planRow?.monthly_limit) || DEFAULT_LIMITS[plan].monthly;
  const monthlyLimit = Number(row.monthly_limit_override) || planMonthly;

  req.apiKey = {
    id: row.id,
    orgId: row.org_id,
    keyPrefix: row.key_prefix,
    scopes: row.scopes ?? [],
    env,
    plan,
    planStatus,
    rpmLimit: row.rpm_limit ?? 60,
    rpdLimit: row.rpd_limit ?? 10000,
    monthlyLimit,
    currentPeriodStart: planRow?.current_period_start ?? null,
    currentPeriodEnd: planRow?.current_period_end ?? null,
  };
  next();
}

export function requireScopes(...allowed: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const scopes = req.apiKey?.scopes ?? [];
    const hasScope = allowed.some((s) => scopes.includes(s));
    if (!hasScope) {
      res.status(403).json({ success: false, error: `Missing required scope: ${allowed.join(' or ')}.` });
      return;
    }
    next();
  };
}
