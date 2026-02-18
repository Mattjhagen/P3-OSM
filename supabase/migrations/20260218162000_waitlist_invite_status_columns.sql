-- Waitlist onboarding columns used by admin queue + invite rollout flow.
-- Idempotent migration for existing projects.

alter table public.waitlist
  add column if not exists invite_status text not null default 'pending',
  add column if not exists invited_at timestamptz,
  add column if not exists onboarded_at timestamptz,
  add column if not exists invite_batch_id text;

update public.waitlist
set invite_status = case
  when lower(coalesce(status, '')) = 'invited' then 'invited'
  when lower(coalesce(status, '')) = 'onboarded' then 'onboarded'
  when lower(coalesce(status, '')) = 'blocked' then 'blocked'
  else 'pending'
end;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'waitlist_invite_status_check'
      and conrelid = 'public.waitlist'::regclass
  ) then
    alter table public.waitlist
      add constraint waitlist_invite_status_check
      check (invite_status in ('pending', 'invited', 'onboarded', 'blocked'));
  end if;
end
$$;

create index if not exists idx_waitlist_invite_status_created_at
  on public.waitlist(invite_status, created_at asc, id asc);

create index if not exists idx_waitlist_invited_at
  on public.waitlist(invited_at);

create index if not exists idx_waitlist_onboarded_at
  on public.waitlist(onboarded_at);

-- Prompt PostgREST to reload metadata after column changes.
select pg_notify('pgrst', 'reload schema');
