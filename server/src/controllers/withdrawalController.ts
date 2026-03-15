import { NextFunction, Request, Response } from 'express';
import { WithdrawalService } from '../services/withdrawalService';
import { ComplianceService } from '../services/complianceService';

const attachStatus = (error: any) => {
  if (typeof error?.status === 'number') {
    return error;
  }

  const message = String(error?.message || '').toLowerCase();
  if (message.includes('not configured') || message.includes('disabled')) {
    error.status = 503;
    return error;
  }
  if (
    message.includes('required') ||
    message.includes('must be') ||
    message.includes('invalid') ||
    message.includes('insufficient') ||
    message.includes('too small')
  ) {
    error.status = 400;
  }
  return error;
};

export const WithdrawalController = {
  requestWithdrawal: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId, method, amountUsd, destination } = req.body || {};
      const uid = req.auth?.userId || String(userId || '');
      if (!uid) {
        return res.status(401).json({ success: false, error: 'Unauthenticated.' });
      }
      if (req.auth?.userId && userId !== undefined && String(userId).trim() !== req.auth.userId) {
        return res.status(403).json({ success: false, error: 'Forbidden: cannot request withdrawal for another user.' });
      }
      const withdrawalMethod = method === 'BTC' ? 'BTC' : method === 'STRIPE' ? 'STRIPE' : null;
      if (!withdrawalMethod) {
        return res.status(400).json({ success: false, error: 'method must be BTC or STRIPE.' });
      }
      const amount = Number(amountUsd);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ success: false, error: 'amountUsd must be a positive number.' });
      }
      if (amount > 100_000) {
        return res.status(400).json({ success: false, error: 'amountUsd exceeds maximum allowed.' });
      }
      const dest = String(destination || '').trim();
      if (!dest) {
        return res.status(400).json({ success: false, error: 'destination is required.' });
      }
      if (dest.length > 500) {
        return res.status(400).json({ success: false, error: 'destination too long.' });
      }
      await ComplianceService.requireFeatureApproval(uid, 'WITHDRAW_FUNDS');

      const result = await WithdrawalService.requestWithdrawal({
        userId: uid,
        method: withdrawalMethod,
        amountUsd: Math.round(amount * 100) / 100,
        destination: dest,
      });

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(attachStatus(error));
    }
  },
};
