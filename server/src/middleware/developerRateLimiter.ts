/**
 * Per-key rate limiting for Developer API (rpm_limit, rpd_limit).
 * In-memory sliding window; use Redis (RATE_LIMIT_REDIS_URL) for multi-instance later.
 */

import { Request, Response, NextFunction } from 'express';

interface Window {
  minute: { count: number; resetAt: number };
  day: { count: number; resetAt: number };
}

const store = new Map<string, Window>();

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function getWindow(keyId: string): Window {
  let w = store.get(keyId);
  const now = Date.now();
  if (!w) {
    w = {
      minute: { count: 0, resetAt: now + MINUTE_MS },
      day: { count: 0, resetAt: now + DAY_MS },
    };
    store.set(keyId, w);
  }
  if (now >= w.minute.resetAt) {
    w.minute = { count: 0, resetAt: now + MINUTE_MS };
  }
  if (now >= w.day.resetAt) {
    w.day = { count: 0, resetAt: now + DAY_MS };
  }
  return w;
}

export function developerRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const key = req.apiKey;
  if (!key) {
    return next();
  }

  const w = getWindow(key.id);
  w.minute.count += 1;
  w.day.count += 1;

  const limitMinute = key.rpmLimit ?? 60;
  const limitDay = key.rpdLimit ?? 10000;

  if (w.minute.count > limitMinute) {
    res.setHeader('X-RateLimit-Limit', String(limitMinute));
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(w.minute.resetAt / 1000)));
    res.status(429).json({
      success: false,
      error: 'Too many requests per minute. Check X-RateLimit-* headers.',
    });
    return;
  }

  if (w.day.count > limitDay) {
    res.setHeader('X-RateLimit-Limit', String(limitDay));
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(w.day.resetAt / 1000)));
    res.status(429).json({
      success: false,
      error: 'Daily rate limit exceeded. Check X-RateLimit-* headers.',
    });
    return;
  }

  res.setHeader('X-RateLimit-Limit', String(limitMinute));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limitMinute - w.minute.count)));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(w.minute.resetAt / 1000)));
  next();
}
