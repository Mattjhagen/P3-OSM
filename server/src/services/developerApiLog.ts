/**
 * Log Developer API usage and audit events (api_key_usage, api_audit_logs).
 */

import { Request } from 'express';
import { supabase } from '../config/supabase';

export async function logUsage(
  apiKeyId: string,
  path: string,
  statusCode: number,
  latencyMs: number
): Promise<void> {
  await supabase.from('api_key_usage').insert({
    api_key_id: apiKeyId,
    path,
    status_code: statusCode,
    latency_ms: latencyMs,
  });
}

export async function logAudit(
  orgId: string,
  apiKeyId: string | null,
  eventType: string,
  req: Request,
  meta?: Record<string, unknown>
): Promise<void> {
  await supabase.from('api_audit_logs').insert({
    org_id: orgId,
    api_key_id: apiKeyId,
    event_type: eventType,
    ip: req.ip ?? req.socket?.remoteAddress ?? null,
    user_agent: req.get('user-agent') ?? null,
    meta: meta ?? {},
  });
}
