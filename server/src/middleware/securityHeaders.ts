import { Request, Response, NextFunction } from 'express';

/**
 * Sets production-safe security response headers.
 * Applied to all responses; safe for API and health endpoints.
 * HSTS enabled only in production (max-age 1 year, includeSubDomains).
 */
export const securityHeaders = (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0'); // Legacy; CSP is preferred when used
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  next();
};
