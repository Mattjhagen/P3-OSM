import { assertAdmin } from './waitlistAdminService';
import { supabase } from '../config/supabase';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function getRecentEvents(
  adminEmail: string,
  authorizationHeader: string,
  limit = DEFAULT_LIMIT
) {
  await assertAdmin(adminEmail, authorizationHeader);
  const safeLimit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));

  const { data, error } = await supabase
    .from('telemetry_events')
    .select('id, anonymous_id, session_id, event_name, properties, policy_version, created_at')
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) throw error;
  return data ?? [];
}

export async function getRecentFeatures(
  adminEmail: string,
  authorizationHeader: string,
  limit = DEFAULT_LIMIT
) {
  await assertAdmin(adminEmail, authorizationHeader);
  const safeLimit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));

  const { data, error } = await supabase
    .from('recommendation_features')
    .select('id, anonymous_id, session_id, event_count, last_event_at, scoring_inputs, updated_at')
    .order('updated_at', { ascending: false })
    .limit(safeLimit);

  if (error) throw error;
  return data ?? [];
}
