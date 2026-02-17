-- Stripe Identity session tracking for KYC/AML workflows.

create extension if not exists "pgcrypto";

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create table if not exists public.stripe_identity_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id text not null,
    stripe_session_id text not null unique,
    client_reference_id text,
    requested_tier integer not null default 2,
    status text not null default 'created',
    requires_manual_review boolean not null default false,
    aml_risk_score integer,
    aml_notes text,
    last_error_code text,
    last_error_reason text,
    return_url text,
    verification_url text,
    verified_at timestamptz,
    provider text not null default 'stripe_identity',
    raw_session jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_stripe_identity_sessions_user_created_at
  on public.stripe_identity_sessions(user_id, created_at desc);

create index if not exists idx_stripe_identity_sessions_status_created_at
  on public.stripe_identity_sessions(status, created_at desc);

create index if not exists idx_stripe_identity_sessions_manual_review
  on public.stripe_identity_sessions(requires_manual_review, created_at desc);

drop trigger if exists update_stripe_identity_sessions_updated_at on public.stripe_identity_sessions;
create trigger update_stripe_identity_sessions_updated_at
before update on public.stripe_identity_sessions
for each row execute procedure public.update_updated_at_column();

alter table public.stripe_identity_sessions disable row level security;
