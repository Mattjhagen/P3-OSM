import { supabase } from '../config/supabase';

/**
 * Aggregate telemetry events into recommendation_features (scoring_inputs).
 * Called after each event ingest to keep features up to date.
 */
export async function aggregateIntoRecommendationFeatures(
  anonymousId: string,
  sessionId: string,
  eventName: string,
  properties: Record<string, unknown>
): Promise<void> {
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from('recommendation_features')
    .select('event_count, scoring_inputs')
    .eq('anonymous_id', anonymousId)
    .maybeSingle();

  const prevCount = (existing as any)?.event_count ?? 0;
  const prevInputs = (existing as any)?.scoring_inputs ?? {};
  const eventCount = prevCount + 1;

  const inputs: Record<string, unknown> = { ...prevInputs };
  const eventCounts = (inputs.event_name_counts as Record<string, number>) ?? {};
  eventCounts[eventName] = (eventCounts[eventName] ?? 0) + 1;
  inputs.event_name_counts = eventCounts;

  if (typeof properties.page === 'string' && properties.page) {
    const pageCounts = (inputs.page_counts as Record<string, number>) ?? {};
    pageCounts[properties.page] = (pageCounts[properties.page] ?? 0) + 1;
    inputs.page_counts = pageCounts;
  }
  if (typeof properties.value === 'number' && Number.isFinite(properties.value)) {
    inputs.total_value = ((inputs.total_value as number) ?? 0) + properties.value;
  }
  if (typeof properties.count === 'number' && Number.isFinite(properties.count)) {
    inputs.total_count = ((inputs.total_count as number) ?? 0) + properties.count;
  }
  inputs.last_event_name = eventName;
  inputs.updated_at = now;

  await supabase.from('recommendation_features').upsert(
    {
      anonymous_id: anonymousId,
      session_id: sessionId,
      event_count: eventCount,
      last_event_at: now,
      scoring_inputs: inputs,
      updated_at: now,
    },
    { onConflict: 'anonymous_id' }
  );
}
