import { Request, Response, NextFunction } from 'express';
import { ingestEvent } from '../services/eventsIngestService';

export const EventsController = {
  ingest: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await ingestEvent(req.body);
      if (!result.ok) {
        return res.status(400).json({ success: false, error: result.error });
      }
      return res.status(201).json({ success: true, id: result.id });
    } catch (err) {
      next(err);
    }
  },
};
