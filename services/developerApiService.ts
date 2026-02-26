/**
 * Portal calls to backend /api/developer/* (keys, usage, audit). Uses Supabase session.
 */

import { supabase } from '../supabaseClient';
import { BACKEND_URL } from '../client-services/backendService';

async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const url = path.startsWith('http') ? path : `${BACKEND_URL}${path}`;
  return fetch(url, { ...options, headers: { ...headers, ...options.headers } });
}

export interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  status: string;
  rpm_limit: number;
  rpd_limit: number;
  created_at: string;
  revoked_at?: string;
}

export async function listKeys(): Promise<ApiKeyRow[]> {
  const res = await authFetch('/api/developer/keys');
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to list keys');
  return json.data ?? [];
}

export async function createKey(params: {
  name: string;
  env?: 'live' | 'test';
  scopes?: string[];
  rpm_limit?: number;
  rpd_limit?: number;
}): Promise<{ raw_key: string; data: ApiKeyRow }> {
  const res = await authFetch('/api/developer/keys', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to create key');
  return { raw_key: json.data.raw_key, data: json.data };
}

export async function revokeKey(id: string): Promise<void> {
  const res = await authFetch(`/api/developer/keys/${id}`, { method: 'DELETE' });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to revoke key');
}

export interface UsageRow {
  id?: string;
  api_key_id: string;
  path: string;
  status_code: number | null;
  latency_ms: number | null;
  created_at: string;
}

export async function getUsage(): Promise<UsageRow[]> {
  const res = await authFetch('/api/developer/usage');
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to load usage');
  return json.data ?? [];
}

export interface AuditRow {
  id: string;
  event_type: string;
  api_key_id: string | null;
  ip: string | null;
  user_agent: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export async function getAudit(): Promise<AuditRow[]> {
  const res = await authFetch('/api/developer/audit');
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to load audit logs');
  return json.data ?? [];
}
