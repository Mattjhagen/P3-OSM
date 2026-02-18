-- Optional hardening migration:
-- Adds case-insensitive uniqueness for waitlist emails.
-- This migration intentionally fails if normalized duplicates already exist.

do $$
declare
  duplicate_groups integer;
begin
  select count(*)::int
  into duplicate_groups
  from (
    select lower(btrim(email)) as normalized_email
    from public.waitlist
    group by lower(btrim(email))
    having count(*) > 1
  ) duplicates;

  if duplicate_groups > 0 then
    raise exception
      'Cannot create waitlist lower(email) unique index: found % duplicate normalized email group(s).',
      duplicate_groups;
  end if;
end;
$$;

create unique index if not exists idx_waitlist_email_lower_unique
  on public.waitlist (lower(btrim(email)));
