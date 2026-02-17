import { NextFunction, Request, Response } from 'express';
import { AdminNotificationPayload, AdminNotificationService } from '../services/adminNotificationService';

const PRIVILEGED_ROLES = new Set(['admin', 'risk_officer', 'service_role']);
const USER_ALLOWED_CATEGORIES = new Set<AdminNotificationPayload['category']>([
  'chat_request',
  'ticket',
  'manual_review',
]);

const asString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const normalizeCategory = (value: unknown): AdminNotificationPayload['category'] | null => {
  const category = asString(value).toLowerCase();
  if (
    category === 'chat_request' ||
    category === 'manual_review' ||
    category === 'ticket' ||
    category === 'risk_alert'
  ) {
    return category;
  }

  return null;
};

export const NotificationController = {
  notifyAdmin: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUserId = req.auth?.userId;
      if (!authUserId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthenticated request.',
        });
      }

      const category = normalizeCategory(req.body?.category);
      const subject = asString(req.body?.subject);
      const message = asString(req.body?.message);
      const metadata =
        req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {};

      if (!category) {
        return res.status(400).json({
          success: false,
          error: 'category must be one of: chat_request, manual_review, ticket, risk_alert.',
        });
      }

      if (subject.length < 3 || subject.length > 220) {
        return res.status(400).json({
          success: false,
          error: 'subject must be between 3 and 220 characters.',
        });
      }

      if (message.length < 3) {
        return res.status(400).json({
          success: false,
          error: 'message must be at least 3 characters.',
        });
      }

      const roles = req.auth?.roles || [];
      const isPrivileged = roles.some((role) => PRIVILEGED_ROLES.has(String(role).toLowerCase()));

      if (!isPrivileged && !USER_ALLOWED_CATEGORIES.has(category)) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: insufficient privileges for requested category.',
        });
      }

      const notification = await AdminNotificationService.notify({
        category,
        subject,
        message,
        userId: authUserId,
        userEmail: req.auth?.email || undefined,
        metadata: {
          ...(metadata as Record<string, unknown>),
          triggered_by: authUserId,
        },
      });

      return res.status(201).json({
        success: true,
        data: notification,
      });
    } catch (error) {
      next(error);
    }
  },
};

