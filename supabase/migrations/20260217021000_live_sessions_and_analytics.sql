-- Live session tracking + attribution analytics for admin operational KPIs

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.live_sessions (
    session_id TEXT PRIMARY KEY,
    user_id TEXT,
    email TEXT,
    is_authenticated BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    country TEXT,
    region TEXT,
    city TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    source_type TEXT NOT NULL DEFAULT 'direct',
    source_value TEXT,
    referral_code TEXT,
    invite_code TEXT,
    waitlist_token TEXT,
    landing_path TEXT,
    user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_live_sessions_last_seen ON public.live_sessions(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_live_sessions_country ON public.live_sessions(country);
CREATE INDEX IF NOT EXISTS idx_live_sessions_source_type ON public.live_sessions(source_type);
CREATE INDEX IF NOT EXISTS idx_live_sessions_email ON public.live_sessions(email);
CREATE INDEX IF NOT EXISTS idx_live_sessions_user_id ON public.live_sessions(user_id);

CREATE TABLE IF NOT EXISTS public.analytics_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id TEXT,
    user_id TEXT,
    email TEXT,
    event_type TEXT NOT NULL,
    event_name TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON public.analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session_id ON public.analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type ON public.analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_name ON public.analytics_events(event_name);

-- Frontend writes to these tables with anon key in this beta architecture.
ALTER TABLE public.live_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events DISABLE ROW LEVEL SECURITY;

