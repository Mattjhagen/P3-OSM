import { NextFunction, Request, Response } from 'express';
import {
  WaitlistInviteError,
  WaitlistInviteService,
} from '../services/waitlistInviteService';

const asString = (value: unknown) => String(value || '').trim();

const resolveErrorStatus = (error: unknown) => {
  if (error instanceof WaitlistInviteError) {
    return error.status;
  }
  if (typeof (error as any)?.status === 'number') {
    return (error as any).status;
  }
  return 500;
};

const resolveErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return 'Unexpected waitlist invite error.';
};

export const WaitlistController = {
  sendInvite: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const waitlistId = asString(req.body?.waitlistId);
      const adminEmail = asString(req.body?.adminEmail);
      const adminName = asString(req.body?.adminName);

      const result = await WaitlistInviteService.sendInvite(
        waitlistId,
        adminEmail,
        adminName
      );

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      const status = resolveErrorStatus(error);
      if (status >= 500) {
        return next(error);
      }
      return res.status(status).json({
        success: false,
        error: resolveErrorMessage(error),
      });
    }
  },

  sendBatchInvites: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const countRaw = Number(req.body?.count);
      const adminEmail = asString(req.body?.adminEmail);
      const adminName = asString(req.body?.adminName);

      const result = await WaitlistInviteService.sendBatchInvites(
        countRaw,
        adminEmail,
        adminName
      );

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      const status = resolveErrorStatus(error);
      if (status >= 500) {
        return next(error);
      }
      return res.status(status).json({
        success: false,
        error: resolveErrorMessage(error),
      });
    }
  },
};
