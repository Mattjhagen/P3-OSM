/**
 * Portal Developer API: org, API keys (list/create/revoke). Requires auth.
 */

import { Request, Response } from 'express';
import crypto from 'crypto';
import { supabase } from '../config/supabase';
import { config } from '../config/config';
import { logAudit } from '../services/developerApiLog';

const pepper = () => config.developerApi.apiKeyPepper;

async function getOrCreateOrg(userId: string): Promise<{ id: string } | null> {
  const { data: members } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', userId)
    .in('role', ['owner', 'admin'])
    .limit(1);
  const existing = members?.[0];
  if (existing?.org_id) return { id: existing.org_id };

  const { data: org, error: orgErr } = await supabase
    .from('orgs')
    .insert({ name: 'My Organization', owner_user_id: userId })
    .select('id')
    .single();
  if (orgErr || !org) return null;

  await supabase.from('org_members').insert({ org_id: org.id, user_id: userId, role: 'owner' });
  return { id: org.id };
};

export const getKeys = async (req: Request, res: Response): Promise<void> => {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  const org = await getOrCreateOrg(userId);
  if (!org) {
    res.status(500).json({ success: false, error: 'Could not resolve organization' });
    return;
  }
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, name, key_prefix, scopes, status, rpm_limit, rpd_limit, created_at, revoked_at')
    .eq('org_id', org.id)
    .order('created_at', { ascending: false });
  if (error) {
    res.status(500).json({ success: false, error: error.message });
    return;
  }
  res.json({ success: true, data: data ?? [] });
};

export const createKey = async (req: Request, res: Response): Promise<void> => {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  if (!pepper()) {
    res.status(503).json({ success: false, error: 'Developer API not configured' });
    return;
  }
  const org = await getOrCreateOrg(userId);
  if (!org) {
    res.status(500).json({ success: false, error: 'Could not resolve organization' });
    return;
  }
  const { name, env = 'live', scopes = ['score:read'], rpm_limit = 60, rpd_limit = 10000 } = req.body || {};
  if (!name || typeof name !== 'string') {
    res.status(400).json({ success: false, error: 'Missing or invalid name' });
    return;
  }
  const prefix = env === 'test' ? 'p3_test_' : 'p3_live_';
  const rawKey = prefix + crypto.randomBytes(24).toString('hex');
  const keyPrefix = rawKey.slice(0, 20);
  const keyHash = crypto.createHash('sha256').update(rawKey + pepper()).digest('hex');

  const { data: key, error } = await supabase
    .from('api_keys')
    .insert({
      org_id: org.id,
      name: name.trim(),
      key_prefix: keyPrefix,
      key_hash: keyHash,
      scopes: Array.isArray(scopes) ? scopes : ['score:read'],
      rpm_limit: Number(rpm_limit) || 60,
      rpd_limit: Number(rpd_limit) || 10000,
    })
    .select('id, name, key_prefix, scopes, rpm_limit, rpd_limit, created_at')
    .single();

  if (error) {
    res.status(500).json({ success: false, error: error.message });
    return;
  }
  await logAudit(org.id, key.id, 'api_key.created', req, { name: key.name });
  res.status(201).json({
    success: true,
    data: { ...key, raw_key: rawKey },
    message: 'Copy the key now; it will not be shown again.',
  });
};

export const revokeKey = async (req: Request, res: Response): Promise<void> => {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  const keyId = req.params.id;
  const { data: key } = await supabase.from('api_keys').select('id, org_id').eq('id', keyId).maybeSingle();
  if (!key) {
    res.status(404).json({ success: false, error: 'Key not found' });
    return;
  }
  const { data: member } = await supabase
    .from('org_members')
    .select('id')
    .eq('org_id', key.org_id)
    .eq('user_id', userId)
    .in('role', ['owner', 'admin'])
    .maybeSingle();
  if (!member) {
    res.status(403).json({ success: false, error: 'Forbidden' });
    return;
  }
  const { error } = await supabase
    .from('api_keys')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', keyId);
  if (error) {
    res.status(500).json({ success: false, error: error.message });
    return;
  }
  await logAudit(key.org_id, keyId, 'api_key.revoked', req);
  res.json({ success: true });
};

export const getUsage = async (req: Request, res: Response): Promise<void> => {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  const org = await getOrCreateOrg(userId);
  if (!org) {
    res.status(500).json({ success: false, error: 'Could not resolve organization' });
    return;
  }
  const keyIdsRes = await supabase.from('api_keys').select('id').eq('org_id', org.id);
  const keyIds = (keyIdsRes.data ?? []).map((k) => k.id);
  if (keyIds.length === 0) {
    res.json({ success: true, data: [] });
    return;
  }
  const { data, error } = await supabase
    .from('api_key_usage')
    .select('id, api_key_id, path, status_code, latency_ms, created_at')
    .in('api_key_id', keyIds)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    res.status(500).json({ success: false, error: error.message });
    return;
  }
  res.json({ success: true, data: data ?? [] });
};

export const getAudit = async (req: Request, res: Response): Promise<void> => {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  const org = await getOrCreateOrg(userId);
  if (!org) {
    res.status(500).json({ success: false, error: 'Could not resolve organization' });
    return;
  }
  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', org.id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!member || !['owner', 'admin'].includes(member.role)) {
    res.status(403).json({ success: false, error: 'Only org owners and admins can view audit logs' });
    return;
  }
  const { data, error } = await supabase
    .from('api_audit_logs')
    .select('id, event_type, api_key_id, ip, user_agent, meta, created_at')
    .eq('org_id', org.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    res.status(500).json({ success: false, error: error.message });
    return;
  }
  res.json({ success: true, data: data ?? [] });
};
