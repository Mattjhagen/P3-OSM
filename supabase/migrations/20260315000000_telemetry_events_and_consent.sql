-- Telemetry events (consent-gated, first-party only) and derived features

CREATE TABLE IF NOT EXISTS public.telemetry_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anonymous_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    event_name TEXT NOT NULL,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    policy_version TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_events_created_at ON public.telemetry_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_anonymous_id ON public.telemetry_events(anonymous_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_session_id ON public.telemetry_events(session_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_event_name ON public.telemetry_events(event_name);

ALTER TABLE public.telemetry_events ENABLE ROW LEVEL SECURITY;

-- Only service role can insert/select (backend ingests)
DROP POLICY IF EXISTS "telemetry_events_service_role" ON public.telemetry_events;
CREATE POLICY "telemetry_events_service_role" ON public.telemetry_events
FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Derived features: one row per anonymous_id (or session) with aggregated inputs for scoring
CREATE TABLE IF NOT EXISTS public.recommendation_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anonymous_id TEXT NOT NULL UNIQUE,
    session_id TEXT,
    event_count INTEGER NOT NULL DEFAULT 0,
    last_event_at TIMESTAMPTZ,
    scoring_inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recommendation_features_anonymous_id ON public.recommendation_features(anonymous_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_features_updated_at ON public.recommendation_features(updated_at DESC);

ALTER TABLE public.recommendation_features ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recommendation_features_service_role" ON public.recommendation_features;
CREATE POLICY "recommendation_features_service_role" ON public.recommendation_features
FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
