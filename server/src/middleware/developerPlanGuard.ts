/**
 * Enforce Developer API plan rules:
 * - Live keys require org plan = paid
 */

import { Request, Response, NextFunction } from 'express';
import { logAudit, logUsage } from '../services/developerApiLog';

function getPath(req: Request): string {
  return req.originalUrl?.split('?')[0] ?? req.path;
}

function startTimeMs(res: Response): number {
  const t = (res.locals as any)?.devApiStartTime;
  return typeof t === 'number' ? t : Date.now();
}

export function developerPlanGuard(req: Request, res: Response, next: NextFunction): void {
  const key = req.apiKey;
  if (!key) return next();

  if (key.env === 'live' && key.plan !== 'paid') {
    const statusCode = 402;
    const body = {
      success: false,
      code: 'paid_required',
      error: 'A paid plan is required to use live (production) API keys. Upgrade your organization to continue.',
    };

    res.status(statusCode).json(body);

    const latencyMs = Math.round(Date.now() - startTimeMs(res));
    void logUsage(key.id, getPath(req), statusCode, latencyMs);
    void logAudit(key.orgId, key.id, 'plan.paid_required', req, {
      env: key.env,
      plan: key.plan,
      path: getPath(req),
    });
    return;
  }

  next();
}

