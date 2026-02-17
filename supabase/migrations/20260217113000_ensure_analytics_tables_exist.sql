-- Ensure analytics tables exist even if previous migration history was repaired/manual.

create extension if not exists "pgcrypto";

create table if not exists public.live_sessions (
    session_id text primary key,
    user_id text,
    email text,
    is_authenticated boolean not null default false,
    is_active boolean not null default true,
    first_seen timestamptz not null default now(),
    last_seen timestamptz not null default now(),
    country text,
    region text,
    city text,
    latitude double precision,
    longitude double precision,
    source_type text not null default 'direct',
    source_value text,
    referral_code text,
    invite_code text,
    waitlist_token text,
    landing_path text,
    user_agent text
);

create index if not exists idx_live_sessions_last_seen on public.live_sessions(last_seen desc);
create index if not exists idx_live_sessions_country on public.live_sessions(country);
create index if not exists idx_live_sessions_source_type on public.live_sessions(source_type);
create index if not exists idx_live_sessions_email on public.live_sessions(email);
create index if not exists idx_live_sessions_user_id on public.live_sessions(user_id);

create table if not exists public.analytics_events (
    id uuid primary key default gen_random_uuid(),
    session_id text,
    user_id text,
    email text,
    event_type text not null,
    event_name text not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_analytics_events_created_at on public.analytics_events(created_at desc);
create index if not exists idx_analytics_events_session_id on public.analytics_events(session_id);
create index if not exists idx_analytics_events_event_type on public.analytics_events(event_type);
create index if not exists idx_analytics_events_event_name on public.analytics_events(event_name);

alter table public.live_sessions disable row level security;
alter table public.analytics_events disable row level security;
