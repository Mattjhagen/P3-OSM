-- Funds integrity / reputation / escrow support fields

create extension if not exists "pgcrypto";

alter table public.users
  add column if not exists status text not null default 'ACTIVE',
  add column if not exists reputation_score integer not null default 50,
  add column if not exists default_flag boolean not null default false,
  add column if not exists stripe_customer_id text;

create table if not exists public.balances (
    id uuid primary key default gen_random_uuid(),
    user_id text not null unique,
    fiat_available numeric(18,2) not null default 0,
    fiat_escrow numeric(18,2) not null default 0,
    crypto_available numeric(18,8) not null default 0,
    crypto_escrow numeric(18,8) not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_balances_user_id on public.balances(user_id);

drop trigger if exists update_balances_updated_at on public.balances;
create trigger update_balances_updated_at
before update on public.balances
for each row execute procedure public.update_updated_at_column();

alter table if exists public.loan_activity
  add column if not exists platform_fee numeric(18,2) not null default 0,
  add column if not exists due_date timestamptz,
  add column if not exists fee_breakdown_hash text;

alter table public.balances disable row level security;
