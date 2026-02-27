/**
 * Enforce monthly quota for Developer API.
 * Uses DB count on cache miss; otherwise increments a per-key in-memory counter.
 */

import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { logAudit, logUsage } from '../services/developerApiLog';

type CacheEntry = {
  count: number;
  periodStartIso: string;
  periodEndMs: number;
  lastSyncMs: number;
};

const cache = new Map<string, CacheEntry>();
const SYNC_TTL_MS = 30_000;

function getPath(req: Request): string {
  return req.originalUrl?.split('?')[0] ?? req.path;
}

function startTimeMs(res: Response): number {
  const t = (res.locals as any)?.devApiStartTime;
  return typeof t === 'number' ? t : Date.now();
}

function monthBoundsUtc(now = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
  return { start, end };
}

function parseOrDefaultPeriod(req: Request): { start: Date; end: Date } {
  const key = req.apiKey;
  if (!key) return monthBoundsUtc();

  const start = key.currentPeriodStart ? new Date(key.currentPeriodStart) : null;
  const end = key.currentPeriodEnd ? new Date(key.currentPeriodEnd) : null;
  if (start && end && !Number.isNaN(start.valueOf()) && !Number.isNaN(end.valueOf())) {
    return { start, end };
  }
  return monthBoundsUtc();
}

async function loadCountFromDb(apiKeyId: string, start: Date, end: Date): Promise<number> {
  const { count } = await supabase
    .from('api_key_usage')
    .select('*', { count: 'exact', head: true })
    .eq('api_key_id', apiKeyId)
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString());
  return Number(count) || 0;
}

export async function developerMonthlyQuota(req: Request, res: Response, next: NextFunction): Promise<void> {
  const key = req.apiKey;
  if (!key) return next();

  const limit = Number(key.monthlyLimit) || 0;
  if (limit <= 0) return next();

  const { start, end } = parseOrDefaultPeriod(req);
  const cacheKey = `${key.id}:${start.toISOString().slice(0, 7)}`; // YYYY-MM
  const nowMs = Date.now();
  const periodEndMs = end.valueOf();

  let entry = cache.get(cacheKey);
  if (!entry || nowMs >= entry.periodEndMs) {
    entry = {
      count: 0,
      periodStartIso: start.toISOString(),
      periodEndMs,
      lastSyncMs: 0,
    };
    cache.set(cacheKey, entry);
  }

  if (nowMs - entry.lastSyncMs > SYNC_TTL_MS) {
    try {
      entry.count = await loadCountFromDb(key.id, start, end);
      entry.lastSyncMs = nowMs;
    } catch (e) {
      // If DB count fails, do not block traffic; fall back to in-memory counter.
      entry.lastSyncMs = nowMs;
    }
  }

  const projected = entry.count + 1;
  const remaining = Math.max(0, limit - entry.count);

  res.setHeader('X-MonthlyQuota-Limit', String(limit));
  res.setHeader('X-MonthlyQuota-Remaining', String(remaining));
  res.setHeader('X-MonthlyQuota-Reset', String(Math.ceil(periodEndMs / 1000)));

  if (projected > limit) {
    const statusCode = 429;
    const body = {
      success: false,
      code: 'monthly_quota_exceeded',
      error: 'Monthly quota exceeded for this API key.',
      meta: {
        monthly_limit: limit,
        period_start: start.toISOString(),
        period_end: end.toISOString(),
      },
    };
    res.status(statusCode).json(body);

    const latencyMs = Math.round(Date.now() - startTimeMs(res));
    void logUsage(key.id, getPath(req), statusCode, latencyMs);
    void logAudit(key.orgId, key.id, 'quota.monthly_exceeded', req, {
      limit,
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      path: getPath(req),
    });
    return;
  }

  // Reserve one unit in-memory so multiple concurrent requests don't all pass after a DB sync.
  entry.count = projected;
  next();
}

