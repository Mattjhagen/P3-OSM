import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { getKycProvider } from '../kyc';
import { demoProvider } from '../kyc/providers/demo';
import { config } from '../config/config';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getUserId(req: Request): string | null {
  return req.auth?.userId ?? null;
}

export const KycController = {
  /**
   * POST /api/kyc/start
   * Create KYC session and return verification URL.
   */
  start: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      const provider = getKycProvider();

      let result: { sessionId: string; url: string };
      try {
        result = await provider.startSession({ userId });
      } catch (err) {
        if (config.kyc.provider === 'openkyc') {
          result = await demoProvider.startSession({ userId });
        } else {
          throw err;
        }
      }

      const { data: row, error } = await supabase
        .from('kyc_sessions')
        .insert({
          user_id: userId,
          provider: config.kyc.provider,
          provider_session_id: result.sessionId,
          status: 'created',
          extracted: null,
        })
        .select('id')
        .single();

      if (error) {
        return res.status(500).json({ error: 'Failed to create KYC session' });
      }

      return res.status(200).json({
        sessionId: row.id,
        verificationUrl: result.url,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/kyc/status/:sessionId
   * Get KYC session status.
   */
  status: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = String(req.params.sessionId || '').trim();
      if (!UUID_REGEX.test(sessionId)) {
        return res.status(400).json({ error: 'Invalid session ID' });
      }

      const { data: row, error } = await supabase
        .from('kyc_sessions')
        .select('id, provider_session_id, status, extracted')
        .eq('id', sessionId)
        .maybeSingle();

      if (error || !row) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const terminal = ['approved', 'rejected', 'error'].includes(row.status);
      if (!terminal) {
        const provider = getKycProvider();
        try {
          const providerStatus = await provider.getStatus(row.provider_session_id);
          if (providerStatus.status !== row.status || providerStatus.extracted !== row.extracted) {
            await supabase
              .from('kyc_sessions')
              .update({
                status: providerStatus.status,
                extracted: providerStatus.extracted,
                updated_at: new Date().toISOString(),
              })
              .eq('id', sessionId);
            return res.status(200).json({
              status: providerStatus.status,
              extracted: providerStatus.extracted,
            });
          }
        } catch (err) {
          if (config.kyc.provider === 'openkyc') {
            const demoStatus = await demoProvider.getStatus(row.provider_session_id);
            if (demoStatus.status === 'approved') {
              await supabase
                .from('kyc_sessions')
                .update({
                  status: demoStatus.status,
                  extracted: demoStatus.extracted,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', sessionId);
              return res.status(200).json({
                status: demoStatus.status,
                extracted: demoStatus.extracted,
              });
            }
          }
        }
      }

      return res.status(200).json({
        status: row.status,
        extracted: row.extracted,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/kyc/webhook
   * OpenKYC webhook - safe no-op if not configured.
   */
  webhook: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const secret = config.kyc.openkycWebhookSecret;
      if (!secret) {
        return res.status(200).json({ received: true });
      }

      const headerSecret = req.headers['x-openkyc-signature'] || req.headers['x-webhook-secret'];
      if (headerSecret !== secret) {
        return res.status(401).json({ error: 'Invalid webhook secret' });
      }

      const body = req.body as { sessionId?: string; provider_session_id?: string; status?: string; extracted?: Record<string, unknown> };
      const providerSessionId = body.provider_session_id || body.sessionId;
      if (!providerSessionId) {
        return res.status(200).json({ received: true });
      }

      const { data: row } = await supabase
        .from('kyc_sessions')
        .select('id')
        .eq('provider_session_id', providerSessionId)
        .maybeSingle();

      if (row) {
        await supabase
          .from('kyc_sessions')
          .update({
            status: body.status || 'pending',
            extracted: body.extracted ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);
      }

      return res.status(200).json({ received: true });
    } catch (error) {
      next(error);
    }
  },
};
