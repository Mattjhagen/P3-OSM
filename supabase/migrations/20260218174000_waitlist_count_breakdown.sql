-- Return waitlist summary breakdown from RPC:
-- [{ total, pending, invited, onboarded }]

drop function if exists public.waitlist_count();

create function public.waitlist_count()
returns table (
  total int,
  pending int,
  invited int,
  onboarded int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*)::int as total,
    coalesce(sum((status = 'PENDING')::int), 0)::int as pending,
    coalesce(sum((status = 'INVITED')::int), 0)::int as invited,
    coalesce(sum((status = 'ONBOARDED')::int), 0)::int as onboarded
  from public.waitlist;
$$;

grant execute on function public.waitlist_count() to anon, authenticated;

-- Keep PostgREST schema in sync after function signature change.
notify pgrst, 'reload schema';
