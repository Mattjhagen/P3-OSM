import { supabase } from '../config/supabase';
import { aggregateIntoRecommendationFeatures } from './derivedFeaturesService';

const MAX_EVENT_NAME_LEN = 128;
const MAX_PROPERTIES_KEYS = 20;
const MAX_STRING_LEN = 512;
const ALLOWED_PROP_KEYS = new Set([
  'event_name', 'page', 'section', 'referral_code', 'waitlist_token',
  'element', 'category', 'value', 'count', 'duration_ms', 'error_code',
]);

function trim(s: unknown): string {
  return String(s ?? '').trim();
}

function stripValue(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.slice(0, MAX_STRING_LEN);
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'boolean') return v;
  return null;
}

function stripProperties(properties: unknown): Record<string, unknown> {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return {};
  }
  const out: Record<string, unknown> = {};
  const entries = Object.entries(properties as Record<string, unknown>);
  for (let i = 0; i < Math.min(entries.length, MAX_PROPERTIES_KEYS); i++) {
    const [k, v] = entries[i];
    if (!ALLOWED_PROP_KEYS.has(k)) continue;
    const stripped = stripValue(v);
    if (stripped !== null) out[k] = stripped;
  }
  return out;
}

export interface IngestEventBody {
  event_name: string;
  anonymous_id: string;
  session_id: string;
  properties?: Record<string, unknown>;
  policy_version?: string;
  ts?: string;
}

export interface IngestResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function ingestEvent(body: unknown): Promise<IngestResult> {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Body must be an object.' };
  }

  const b = body as Record<string, unknown>;
  const eventName = trim(b.event_name);
  const anonymousId = trim(b.anonymous_id);
  const sessionId = trim(b.session_id);

  if (!eventName) return { ok: false, error: 'event_name is required.' };
  if (eventName.length > MAX_EVENT_NAME_LEN) {
    return { ok: false, error: 'event_name too long.' };
  }
  if (!anonymousId) return { ok: false, error: 'anonymous_id is required.' };
  if (anonymousId.length > MAX_STRING_LEN) {
    return { ok: false, error: 'anonymous_id too long.' };
  }
  if (!sessionId) return { ok: false, error: 'session_id is required.' };
  if (sessionId.length > MAX_STRING_LEN) {
    return { ok: false, error: 'session_id too long.' };
  }

  const properties = stripProperties(b.properties);
  const policyVersion = trim(b.policy_version) || null;
  if (policyVersion && policyVersion.length > 64) {
    return { ok: false, error: 'policy_version too long.' };
  }

  const { data, error } = await supabase
    .from('telemetry_events')
    .insert({
      anonymous_id: anonymousId,
      session_id: sessionId,
      event_name: eventName,
      properties,
      policy_version: policyVersion,
    })
    .select('id')
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  aggregateIntoRecommendationFeatures(anonymousId, sessionId, eventName, properties).catch(() => {
    // non-fatal; event is already stored
  });
  return { ok: true, id: data?.id };
}
