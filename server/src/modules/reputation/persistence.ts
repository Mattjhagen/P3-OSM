import { supabase } from '../../config/supabase';
import type { RepSnapshotRow, ScoreInput, ScoreResult } from './types';

const SNAPSHOT_TTL_MINUTES = 15;

export async function logRepEvent(
  userId: string,
  type: string,
  meta: Record<string, unknown> = {},
  eventTs?: string,
  orgId?: string | null
): Promise<void> {
  await supabase.from('rep_events').insert({
    user_id: userId,
    org_id: orgId ?? null,
    event_type: type,
    event_ts: eventTs ?? new Date().toISOString(),
    meta,
  });
}

export async function getLatestSnapshot(userId: string): Promise<RepSnapshotRow | null> {
  const { data } = await supabase
    .from('rep_score_snapshots')
    .select(
      'id, user_id, org_id, trust_score, risk_score, capacity_score, reputation_score, band, reasons, features, computed_at'
    )
    .eq('user_id', userId)
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as RepSnapshotRow | null) ?? null;
}

export function isSnapshotFresh(
  snapshot: Pick<RepSnapshotRow, 'computed_at'> | null | undefined,
  ttlMinutes = SNAPSHOT_TTL_MINUTES
): boolean {
  if (!snapshot?.computed_at) return false;
  const ageMs = Date.now() - new Date(snapshot.computed_at).getTime();
  return ageMs >= 0 && ageMs <= ttlMinutes * 60 * 1000;
}

export async function writeScoreSnapshot(params: {
  userId: string;
  orgId?: string | null;
  result: ScoreResult;
  features: ScoreInput;
  force?: boolean;
}): Promise<void> {
  const latest = await getLatestSnapshot(params.userId);
  if (!params.force && latest && isSnapshotFresh(latest)) {
    return;
  }

  await supabase.from('rep_score_snapshots').insert({
    user_id: params.userId,
    org_id: params.orgId ?? null,
    trust_score: params.result.trust_score,
    risk_score: params.result.risk_score,
    capacity_score: params.result.capacity_score,
    reputation_score: params.result.reputation_score,
    band: params.result.band,
    reasons: {
      top_reasons_positive: params.result.top_reasons_positive,
      top_reasons_negative: params.result.top_reasons_negative,
      missing_data: params.result.missing_data,
      caps_applied: params.result.caps_applied,
    },
    features: params.features,
    computed_at: new Date().toISOString(),
  });

  await logRepEvent(
    params.userId,
    'score.computed',
    {
      score: params.result.reputation_score,
      band: params.result.band,
      trust_score: params.result.trust_score,
      risk_score: params.result.risk_score,
      capacity_score: params.result.capacity_score,
    },
    undefined,
    params.orgId ?? null
  );
}

export function snapshotToApiResult(
  snapshot: RepSnapshotRow
): ScoreResult {
  const reasons = (snapshot.reasons ?? {}) as Record<string, string[]>;
  const topPos = Array.isArray(reasons.top_reasons_positive) ? reasons.top_reasons_positive : [];
  const topNeg = Array.isArray(reasons.top_reasons_negative) ? reasons.top_reasons_negative : [];
  const missing = Array.isArray(reasons.missing_data) ? reasons.missing_data : [];
  const caps = Array.isArray(reasons.caps_applied) ? reasons.caps_applied : [];

  return {
    trust_score: Number(snapshot.trust_score),
    risk_score: Number(snapshot.risk_score),
    capacity_score: Number(snapshot.capacity_score),
    reputation_score: Number(snapshot.reputation_score),
    score: Number(snapshot.reputation_score),
    band: snapshot.band,
    top_reasons_positive: topPos,
    top_reasons_negative: topNeg,
    missing_data: missing,
    caps_applied: caps,
    reasons: [...topPos, ...topNeg, ...missing, ...caps],
    featuresUsed: Object.keys((snapshot.features ?? {}) as Record<string, unknown>),
  };
}

