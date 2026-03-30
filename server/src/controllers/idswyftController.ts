import { NextFunction, Request, Response } from 'express';
import { IdswyftService } from '../services/idswyftService';

export const IdswyftController = {
  initialize: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId, addons } = req.body;
      const uid = req.auth?.userId || userId;
      if (!uid) {
        return res.status(400).json({ success: false, error: 'userId is required.' });
      }

      const data = await IdswyftService.initializeVerification(uid, addons);
      return res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  uploadFront: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { verificationId, documentType } = req.body;
      const file = (req as any).file; // Assuming multer or similar is used for file uploads

      if (!file) {
        return res.status(400).json({ success: false, error: 'File is required.' });
      }

      const data = await IdswyftService.uploadFrontDocument(verificationId, documentType, file.buffer);
      return res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  uploadBack: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { verificationId, documentType } = req.body;
      const file = (req as any).file;

      if (!file) {
        return res.status(400).json({ success: false, error: 'File is required.' });
      }

      const data = await IdswyftService.uploadBackDocument(verificationId, documentType, file.buffer);
      return res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  uploadLive: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { verificationId, livenessMetadata } = req.body;
      const file = (req as any).file;

      if (!file) {
        return res.status(400).json({ success: false, error: 'Selfie file is required.' });
      }

      const data = await IdswyftService.uploadLiveCapture(verificationId, file.buffer, livenessMetadata);
      return res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  status: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const data = await IdswyftService.getStatus(id);
      return res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
};
