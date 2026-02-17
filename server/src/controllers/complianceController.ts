import { NextFunction, Request, Response } from 'express';
import { ComplianceService } from '../services/complianceService';

const parseLimit = (value: unknown, fallback = 100) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(200, parsed));
};

const attachStatus = (error: any) => {
  if (typeof error?.status === 'number') return error;

  const message = String(error?.message || '').toLowerCase();
  if (message.includes('not found')) {
    error.status = 404;
    return error;
  }

  if (
    message.includes('required') ||
    message.includes('unsupported') ||
    message.includes('invalid')
  ) {
    error.status = 400;
    return error;
  }

  if (message.includes('manual review') || message.includes('terms must be accepted')) {
    error.status = 403;
    return error;
  }

  if (message.includes('missing') || message.includes('not configured')) {
    error.status = 503;
    return error;
  }

  return error;
};

export const ComplianceController = {
  getFeatureStatus: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = String(req.query.userId || '').trim();
      const featureKey = req.query.feature;
      const status = await ComplianceService.getFeatureStatus(userId, featureKey);
      return res.status(200).json({ success: true, data: status });
    } catch (error) {
      next(attachStatus(error));
    }
  },

  applyForFeature: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        userId,
        feature,
        accepted,
        userEmail,
        attestationSignature,
        walletAddress,
        source,
      } = req.body || {};

      const result = await ComplianceService.applyForFeature({
        userId: String(userId || '').trim(),
        featureKey: feature,
        accepted: Boolean(accepted),
        userEmail: typeof userEmail === 'string' ? userEmail : undefined,
        attestationSignature:
          typeof attestationSignature === 'string' ? attestationSignature : undefined,
        walletAddress: typeof walletAddress === 'string' ? walletAddress : undefined,
        source: typeof source === 'string' ? source : undefined,
        userAgent: req.headers['user-agent'] || '',
        ipAddress: req.ip,
      });

      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(attachStatus(error));
    }
  },

  listDisclosures: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = String(req.query.userId || '').trim();
      const featureKey = req.query.feature;
      const limit = parseLimit(req.query.limit, 100);

      const disclosures = await ComplianceService.listSignedDisclosures({
        userId,
        featureKey,
        limit,
      });

      return res.status(200).json({ success: true, data: disclosures });
    } catch (error) {
      next(attachStatus(error));
    }
  },

  downloadDisclosure: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const disclosureId = String(req.params.id || '').trim();
      const userId = String(req.query.userId || '').trim();

      const disclosure = await ComplianceService.getSignedDisclosureDownload({
        disclosureId,
        userId,
      });

      const filename = `p3-signed-disclosure-${disclosure.featureKey.toLowerCase()}-${disclosure.id}.json`;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(JSON.stringify(disclosure, null, 2));
    } catch (error) {
      next(attachStatus(error));
    }
  },

  listStatements: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = String(req.query.userId || '').trim();
      const statementType =
        req.query.type === 'YEARLY_TAX' ? 'YEARLY_TAX' : req.query.type === 'MONTHLY' ? 'MONTHLY' : undefined;
      const limit = parseLimit(req.query.limit, 100);

      const statements = await ComplianceService.listStatements({
        userId,
        statementType,
        limit,
      });

      return res.status(200).json({ success: true, data: statements });
    } catch (error) {
      next(attachStatus(error));
    }
  },

  downloadStatement: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const statementId = String(req.params.id || '').trim();
      const userId = String(req.query.userId || '').trim();

      const statement = await ComplianceService.getStatementDownload({
        statementId,
        userId,
      });

      const filename = `p3-${statement.statementType.toLowerCase()}-${statement.periodStart}-${statement.userId}.json`;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(JSON.stringify(statement, null, 2));
    } catch (error) {
      next(attachStatus(error));
    }
  },

  runMonthlyGeneration: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await ComplianceService.generateMonthlyStatements('manual_api');
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(attachStatus(error));
    }
  },

  runYearlyGeneration: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await ComplianceService.generateYearlyTaxStatements('manual_api');
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(attachStatus(error));
    }
  },
};
