-- Compliance access controls, signed disclosures, and generated account statements

create extension if not exists pgcrypto;

create table if not exists public.feature_access_controls (
    id uuid primary key default gen_random_uuid(),
    user_id text not null,
    feature_key text not null,
    tos_version text not null,
    status text not null check (status in ('approved', 'manual_review', 'denied', 'revoked', 'pending')),
    accepted_at timestamptz,
    last_risk_evaluated_at timestamptz not null default now(),
    risk_tier integer,
    risk_score integer,
    risk_reasons jsonb not null default '[]'::jsonb,
    manual_review_ticket_id text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(user_id, feature_key)
);

create index if not exists idx_feature_access_controls_user_feature
    on public.feature_access_controls(user_id, feature_key);

create index if not exists idx_feature_access_controls_status
    on public.feature_access_controls(status, updated_at desc);

create table if not exists public.signed_disclosures (
    id uuid primary key default gen_random_uuid(),
    user_id text not null,
    feature_key text not null,
    disclosure_key text not null,
    tos_version text not null,
    disclosure_text text not null,
    accepted boolean not null,
    accepted_at timestamptz not null default now(),
    decision text not null check (decision in ('approved', 'manual_review', 'denied')),
    risk_tier integer,
    risk_reasons jsonb not null default '[]'::jsonb,
    manual_review_ticket_id text,
    signature_algorithm text not null default 'hmac-sha256:v1',
    signature_hash text not null,
    signature_payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_signed_disclosures_user_feature_created
    on public.signed_disclosures(user_id, feature_key, created_at desc);

create table if not exists public.account_statements (
    id uuid primary key default gen_random_uuid(),
    user_id text not null,
    statement_type text not null check (statement_type in ('MONTHLY', 'YEARLY_TAX')),
    period_start date not null,
    period_end date not null,
    generated_at timestamptz not null default now(),
    opening_balance_usd numeric(18,2) not null default 0,
    closing_balance_usd numeric(18,2) not null default 0,
    currency text not null default 'USD',
    totals jsonb not null default '{}'::jsonb,
    entries jsonb not null default '[]'::jsonb,
    signature_algorithm text not null default 'hmac-sha256:v1',
    signature_hash text not null,
    source text not null default 'scheduler',
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(user_id, statement_type, period_start, period_end)
);

create index if not exists idx_account_statements_user_generated
    on public.account_statements(user_id, generated_at desc);

create index if not exists idx_account_statements_type_period
    on public.account_statements(statement_type, period_start, period_end);

-- Ensure update timestamps stay current

drop trigger if exists update_feature_access_controls_updated_at on public.feature_access_controls;
create trigger update_feature_access_controls_updated_at
before update on public.feature_access_controls
for each row execute procedure public.update_updated_at_column();

drop trigger if exists update_account_statements_updated_at on public.account_statements;
create trigger update_account_statements_updated_at
before update on public.account_statements
for each row execute procedure public.update_updated_at_column();

alter table public.feature_access_controls disable row level security;
alter table public.signed_disclosures disable row level security;
alter table public.account_statements disable row level security;
