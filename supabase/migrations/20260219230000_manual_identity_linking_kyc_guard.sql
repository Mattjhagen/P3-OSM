-- Manual identity-linking support and KYC duplicate-account guards.

create extension if not exists "pgcrypto";

-- Ensure users has an email column (normalized + indexed)
alter table public.users
  add column if not exists email text;

create index if not exists idx_users_email_normalized
  on public.users ((lower(btrim(email))));

-- Store verified identity hashes (per user)
create table if not exists public.kyc_verified_identities (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  identity_hash text not null unique,
  provider text not null default 'stripe_identity',
  source_session_id text,
  identity_profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_kyc_verified_identities_user_id
  on public.kyc_verified_identities(user_id);

create index if not exists idx_kyc_verified_identities_created_at
  on public.kyc_verified_identities(created_at desc);

-- Keep updated_at current
drop trigger if exists update_kyc_verified_identities_updated_at on public.kyc_verified_identities;
create trigger update_kyc_verified_identities_updated_at
before update on public.kyc_verified_identities
for each row execute procedure public.update_updated_at_column();

-- This table is written by server/service-role logic; keep RLS off here.
alter table public.kyc_verified_identities disable row level security;

-- Enforce unique normalized email across all users (no kyc_tier dependency)
create or replace function public.enforce_verified_account_email_uniqueness()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text;
  has_any_conflict boolean := false;
begin
  normalized_email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  if normalized_email is null then
    return new;
  end if;

  -- Persist canonical lowercase email values.
  new.email := normalized_email;

  -- Enforce unique email across all users.
  select exists (
    select 1
    from public.users u
    where u.id <> new.id
      and nullif(lower(btrim(coalesce(u.email, ''))), '') = normalized_email
  ) into has_any_conflict;

  if has_any_conflict then
    raise exception using
      errcode = '23505',
      message = 'email_already_in_use',
      detail = 'This email is already associated with another account.';
  end if;

  return new;
end;
$$;

-- Trigger email uniqueness normalization/guard
drop trigger if exists trg_enforce_verified_account_email_uniqueness on public.users;
create trigger trg_enforce_verified_account_email_uniqueness
before insert or update of email
on public.users
for each row execute procedure public.enforce_verified_account_email_uniqueness();