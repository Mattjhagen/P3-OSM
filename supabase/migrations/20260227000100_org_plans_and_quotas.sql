-- Developer API monetization: org plans + monthly quotas
-- Adds org_plans (sandbox vs paid) and optional per-key monthly overrides.

-- enums (idempotent)
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'org_plan' and n.nspname = 'public'
  ) then
    create type public.org_plan as enum ('sandbox', 'paid');
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'org_plan_status' and n.nspname = 'public'
  ) then
    create type public.org_plan_status as enum ('active', 'past_due', 'canceled');
  end if;
end$$;

-- org_plans (1 row per org; default sandbox)
create table if not exists public.org_plans (
  org_id uuid primary key references public.orgs(id) on delete cascade,
  plan public.org_plan not null default 'sandbox',
  status public.org_plan_status not null default 'active',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  monthly_limit int not null default 5000,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_org_plans_plan on public.org_plans(plan);
create index if not exists idx_org_plans_status on public.org_plans(status);

drop trigger if exists update_org_plans_updated_at on public.org_plans;
create trigger update_org_plans_updated_at
before update on public.org_plans
for each row execute procedure public.update_updated_at_column();

-- api_keys extensions
alter table public.api_keys add column if not exists env text;
alter table public.api_keys add column if not exists monthly_limit_override int;

-- backfill env based on stored key_prefix when missing
update public.api_keys
set env = case when key_prefix like 'p3_test_%' then 'test' else 'live' end
where env is null;

-- constrain env values (allow nulls if older rows exist before backfill)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'api_keys_env_check'
  ) then
    alter table public.api_keys
      add constraint api_keys_env_check check (env in ('test', 'live'));
  end if;
end$$;

-- RLS: org_plans (org members can read; org admin/owner or service_role can manage)
alter table public.org_plans enable row level security;

drop policy if exists "org_plans_select_member" on public.org_plans;
create policy "org_plans_select_member" on public.org_plans
for select using (
  exists (
    select 1 from public.org_members m
    where m.org_id = org_plans.org_id and m.user_id = auth.uid()
  )
);

drop policy if exists "org_plans_insert_owner_admin_or_service" on public.org_plans;
create policy "org_plans_insert_owner_admin_or_service" on public.org_plans
for insert with check (
  auth.role() = 'service_role'
  or exists (
    select 1 from public.org_members m
    where m.org_id = org_plans.org_id and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  )
);

drop policy if exists "org_plans_update_owner_admin_or_service" on public.org_plans;
create policy "org_plans_update_owner_admin_or_service" on public.org_plans
for update using (
  auth.role() = 'service_role'
  or exists (
    select 1 from public.org_members m
    where m.org_id = org_plans.org_id and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  )
);

