-- Phase 1 reputation revamp foundation:
-- - append-only events
-- - deterministic feature view
-- - persisted score snapshots

create table if not exists public.rep_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
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
  user_id uuid not null references public.users(id) on delete cascade,
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
with repayment_agg as (
  select
    la.borrower_id as user_id,
    count(rh.id)::int as repayment_count_total,
    coalesce(avg(case when rh.is_late then 0 else 1 end), 1)::numeric as on_time_rate_180d,
    count(*) filter (
      where rh.is_late = true
        and rh.created_at >= now() - interval '30 day'
    )::int as late_count_30d
  from public.loan_activity la
  left join public.repayment_history rh on rh.loan_id = la.id
  group by la.borrower_id
),
loan_agg as (
  select
    la.borrower_id as user_id,
    count(*) filter (where lower(coalesce(la.status, '')) in ('active', 'funded', 'in_progress'))::int as active_loan_count,
    count(*) filter (where lower(coalesce(la.status, '')) in ('defaulted', 'default'))::int as default_count_total,
    count(*) filter (
      where lower(coalesce(la.status, '')) in ('defaulted', 'default')
        and la.created_at >= now() - interval '90 day'
    )::int as default_count_90d,
    avg(case
      when lower(coalesce(la.status, '')) in ('active', 'funded', 'in_progress') then 1.0
      else 0.0
    end)::numeric as utilization_ratio
  from public.loan_activity la
  group by la.borrower_id
),
event_defaults as (
  select
    e.user_id,
    bool_or(e.event_type = 'default.recorded') as default_ever_from_events,
    bool_or(e.event_type = 'default.recorded' and e.event_ts >= now() - interval '90 day') as default_90d_from_events
  from public.rep_events e
  group by e.user_id
)
select
  u.id as user_id,
  greatest(0, extract(day from now() - coalesce(u.created_at, now())))::int as account_age_days,
  greatest(0, coalesce(u.kyc_tier, 0))::int as kyc_level,
  coalesce(r.repayment_count_total, 0) as repayment_count_total,
  coalesce(r.on_time_rate_180d, 1)::numeric as on_time_rate_180d,
  coalesce(r.late_count_30d, 0) as late_count_30d,
  (
    coalesce(l.default_count_total, 0) > 0
    or coalesce(ev.default_ever_from_events, false)
  ) as default_ever,
  (
    coalesce(l.default_count_90d, 0) > 0
    or coalesce(ev.default_90d_from_events, false)
  ) as default_in_last_90d,
  coalesce(l.active_loan_count, 0) as active_loan_count,
  least(greatest(coalesce(l.utilization_ratio, 0), 0), 1)::numeric as utilization_ratio
from public.users u
left join repayment_agg r on r.user_id = u.id
left join loan_agg l on l.user_id = u.id
left join event_defaults ev on ev.user_id = u.id;

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
  or user_id = auth.uid()
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

