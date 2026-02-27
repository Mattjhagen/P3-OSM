-- Fix rep_features_user view to not depend on optional tables (loan_activity/repayment_history)

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
  ot.on_time_rate_180d,
  null::int as active_loan_count,
  null::numeric as utilization_ratio
from base b
left join ev on ev.user_id = b.user_id
left join on_time ot on ot.user_id = b.user_id;

notify pgrst, 'reload schema';
