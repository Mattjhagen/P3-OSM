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
      await ComplianceService.requireFeatureApproval(String(userId || ''), 'WITHDRAW_FUNDS');

      const result = await WithdrawalService.requestWithdrawal({
        userId: String(userId || ''),
        method: method === 'BTC' ? 'BTC' : 'STRIPE',
        amountUsd: Number(amountUsd || 0),
        destination: String(destination || '').trim(),
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
