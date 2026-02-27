-- Phase 1 reputation revamp foundation:
-- - append-only events
-- - deterministic feature view
-- - persisted score snapshots

create table if not exists public.rep_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  org_id uuid references public.orgs(id) on delete set null,
  event_type text not null,
  event_ts timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_rep_events_user_ts on public.rep_events(user_id, event_ts desc);
create index if not exists idx_rep_events_type_ts on public.rep_events(event_type, event_ts desc);

create table if not exists public.rep_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  org_id uuid references public.orgs(id) on delete set null,
  trust_score int not null check (trust_score between 0 and 1000),
  risk_score int not null check (risk_score between 0 and 1000),
  capacity_score int not null check (capacity_score between 0 and 1000),
  reputation_score int not null check (reputation_score between 0 and 1000),
  band text not null check (band in ('A', 'B', 'C', 'D', 'E')),
  reasons jsonb not null default '{}'::jsonb,
  features jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_rep_score_snapshots_user_computed on public.rep_score_snapshots(user_id, computed_at desc);
create index if not exists idx_rep_score_snapshots_org_computed on public.rep_score_snapshots(org_id, computed_at desc);

-- Deterministic feature layer (initial version)
create or replace view public.rep_features_user as
with base as (
  select
    u.id as user_id,
    u.created_at as user_created_at,
    coalesce(u.default_flag, false) as default_flag
  from public.users u
),
ev as (
  select
    e.user_id,
    count(*) filter (where e.event_type in ('repayment_on_time','repayment_late')) as repayment_count_total,
    count(*) filter (where e.event_type = 'repayment_late' and e.event_ts >= now() - interval '30 days') as late_count_30d,
    count(*) filter (where e.event_type = 'default') as default_count_total,
    bool_or(e.event_type = 'default' and e.event_ts >= now() - interval '90 days') as default_in_last_90d,
    max(
      case
        when e.event_type in ('kyc_verified','kyc_level_1') then 1
        when e.event_type in ('kyc_level_2') then 2
        else 0
      end
    ) as kyc_level
  from public.rep_events e
  group by e.user_id
),
on_time as (
  select
    e.user_id,
    case
      when count(*) filter (where e.event_type in ('repayment_on_time','repayment_late')) = 0 then null
      else
        (count(*) filter (where e.event_type = 'repayment_on_time')::numeric
         / nullif(count(*) filter (where e.event_type in ('repayment_on_time','repayment_late'))::numeric, 0))
    end as on_time_rate_180d
  from public.rep_events e
  group by e.user_id
)
select
  b.user_id,
  greatest(0, floor(extract(epoch from (now() - b.user_created_at)) / 86400))::int as account_age_days,
  coalesce(ev.kyc_level, 0)::int as kyc_level,
  coalesce(ev.repayment_count_total, 0)::int as repayment_count_total,
  coalesce(ev.late_count_30d, 0)::int as late_count_30d,
  (coalesce(ev.default_count_total, 0) > 0 or b.default_flag) as default_ever,
  coalesce(ev.default_in_last_90d, false) as default_in_last_90d,
  ot.on_time_rate_180d as on_time_rate_180d,
  null::int as active_loan_count,
  null::numeric as utilization_ratio
from base b
left join ev on ev.user_id = b.user_id
left join on_time ot on ot.user_id = b.user_id;

-- RLS
alter table public.rep_events enable row level security;
alter table public.rep_score_snapshots enable row level security;

-- rep_events: writes by service only; reads by service only (sensitive foundation data)
drop policy if exists "rep_events_insert_service" on public.rep_events;
create policy "rep_events_insert_service" on public.rep_events
for insert with check (auth.role() = 'service_role');

drop policy if exists "rep_events_select_service" on public.rep_events;
create policy "rep_events_select_service" on public.rep_events
for select using (auth.role() = 'service_role');

-- rep_score_snapshots: writes by service only; reads by service, org owner/admin, or the user
drop policy if exists "rep_snapshots_insert_service" on public.rep_score_snapshots;
create policy "rep_snapshots_insert_service" on public.rep_score_snapshots
for insert with check (auth.role() = 'service_role');

drop policy if exists "rep_snapshots_select_org_or_self_or_service" on public.rep_score_snapshots;
create policy "rep_snapshots_select_org_or_self_or_service" on public.rep_score_snapshots
for select using (
  auth.role() = 'service_role'
  or user_id = auth.uid()::text
  or (
    org_id is not null and exists (
      select 1 from public.org_members m
      where m.org_id = rep_score_snapshots.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'developer', 'viewer')
    )
  )
);

-- Keep service-role access to feature view explicit.
grant select on public.rep_features_user to service_role;
