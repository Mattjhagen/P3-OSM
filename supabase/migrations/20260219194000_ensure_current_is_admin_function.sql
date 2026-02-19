create or replace function public.current_is_admin()
returns boolean
language sql
stable
as $$
select
  coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'p3_role') in ('admin', 'risk_officer')
    or exists (
      select 1
      from jsonb_array_elements_text(coalesce(auth.jwt() -> 'app_metadata' -> 'p3_roles', '[]'::jsonb)) as r(role)
      where lower(r.role) in ('admin', 'risk_officer')
    ),
    false
  );
$$;

