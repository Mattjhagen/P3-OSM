-- Manual identity-linking support and KYC duplicate-account guards.

create extension if not exists "pgcrypto";

alter table public.users
  add column if not exists email text;

create index if not exists idx_users_email_normalized
  on public.users ((lower(btrim(email))));

create table if not exists public.kyc_verified_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
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

drop trigger if exists update_kyc_verified_identities_updated_at on public.kyc_verified_identities;
create trigger update_kyc_verified_identities_updated_at
before update on public.kyc_verified_identities
for each row execute procedure public.update_updated_at_column();

alter table public.kyc_verified_identities disable row level security;

create or replace function public.enforce_verified_account_email_uniqueness()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text;
  has_verified_conflict boolean := false;
  has_any_conflict boolean := false;
begin
  normalized_email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  if normalized_email is null then
    return new;
  end if;

  -- Persist canonical lowercase email values.
  new.email := normalized_email;

  select exists (
    select 1
    from public.users u
    where u.id <> new.id
      and nullif(lower(btrim(coalesce(u.email, ''))), '') = normalized_email
      and coalesce(u.kyc_tier, 0) >= 2
  ) into has_verified_conflict;

  if has_verified_conflict then
    raise exception using
      errcode = '23505',
      message = 'email_already_bound_to_verified_account',
      detail = 'This email is already associated with a KYC-verified account.';
  end if;

  if coalesce(new.kyc_tier, 0) >= 2 then
    select exists (
      select 1
      from public.users u
      where u.id <> new.id
        and nullif(lower(btrim(coalesce(u.email, ''))), '') = normalized_email
    ) into has_any_conflict;

    if has_any_conflict then
      raise exception using
        errcode = '23514',
        message = 'verified_account_requires_unique_email',
        detail = 'KYC-verified accounts cannot share an email with another account.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_verified_account_email_uniqueness on public.users;
create trigger trg_enforce_verified_account_email_uniqueness
before insert or update of email, kyc_tier
on public.users
for each row execute procedure public.enforce_verified_account_email_uniqueness();
