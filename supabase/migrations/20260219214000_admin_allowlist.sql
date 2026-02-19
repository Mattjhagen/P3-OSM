create extension if not exists "pgcrypto";

create table if not exists public.admin_allowlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null default 'SUPPORT',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_admin_allowlist_email_lower
  on public.admin_allowlist (lower(btrim(email)));

create index if not exists idx_admin_allowlist_active_role
  on public.admin_allowlist (is_active, role);

alter table public.admin_allowlist enable row level security;

drop policy if exists "admin_allowlist_service_role_only" on public.admin_allowlist;
create policy "admin_allowlist_service_role_only" on public.admin_allowlist
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop trigger if exists update_admin_allowlist_updated_at on public.admin_allowlist;
create trigger update_admin_allowlist_updated_at
before update on public.admin_allowlist
for each row execute procedure public.update_updated_at_column();

