-- Ensure waitlist referral code exists for invite-link onboarding flows.
-- This migration is intentionally idempotent for production hotfix usage.

alter table public.waitlist
  add column if not exists referral_code text;

do $$
declare
  row_id uuid;
  generated_code text;
begin
  for row_id in
    select id
    from public.waitlist
    where referral_code is null or btrim(referral_code) = ''
  loop
    loop
      generated_code := upper(substr(md5(random()::text || clock_timestamp()::text || row_id::text), 1, 10));
      exit when not exists (
        select 1
        from public.waitlist
        where referral_code = generated_code
      );
    end loop;

    update public.waitlist
    set referral_code = generated_code
    where id = row_id
      and (referral_code is null or btrim(referral_code) = '');
  end loop;
end;
$$;

create unique index if not exists waitlist_referral_code_unique
  on public.waitlist (referral_code)
  where referral_code is not null and btrim(referral_code) <> '';

create or replace function public.ensure_waitlist_referral_code()
returns trigger
language plpgsql
as $$
declare
  generated_code text;
begin
  if new.referral_code is null or btrim(new.referral_code) = '' then
    loop
      generated_code := upper(substr(md5(random()::text || clock_timestamp()::text || coalesce(new.id::text, '')), 1, 10));
      exit when not exists (
        select 1
        from public.waitlist
        where referral_code = generated_code
      );
    end loop;
    new.referral_code := generated_code;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_waitlist_referral_code on public.waitlist;
create trigger trg_waitlist_referral_code
before insert on public.waitlist
for each row execute function public.ensure_waitlist_referral_code();
