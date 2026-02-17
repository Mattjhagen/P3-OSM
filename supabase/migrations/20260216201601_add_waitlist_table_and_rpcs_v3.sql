create table if not exists public.waitlist (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    email text not null unique,
    status text not null default 'PENDING',
    created_at timestamptz default now()
);

create index if not exists idx_waitlist_created_at on public.waitlist(created_at);
create index if not exists idx_waitlist_status on public.waitlist(status);
create index if not exists idx_waitlist_email on public.waitlist(email);

alter table public.waitlist enable row level security;

drop policy if exists "waitlist_select_service" on public.waitlist;
create policy "waitlist_select_service" on public.waitlist
for select
using (auth.role() = 'service_role');

drop policy if exists "waitlist_insert_public" on public.waitlist;
create policy "waitlist_insert_public" on public.waitlist
for insert
with check (auth.role() in ('anon', 'authenticated', 'service_role'));

drop policy if exists "waitlist_update_service" on public.waitlist;
create policy "waitlist_update_service" on public.waitlist
for update
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create or replace function public.waitlist_position(email_input text)
returns table(queue_position bigint, name text)
language sql
security definer
set search_path = public
as $$
    with ordered as (
        select
            id,
            email,
            name,
            row_number() over (order by created_at asc, id asc) as rn
        from public.waitlist
    )
    select ordered.rn as queue_position, ordered.name
    from ordered
    where lower(ordered.email) = lower(trim(email_input))
    limit 1;
$$;

create or replace function public.waitlist_count()
returns bigint
language sql
security definer
set search_path = public
as $$
    select count(*) from public.waitlist;
$$;

grant execute on function public.waitlist_position(text) to anon, authenticated;
grant execute on function public.waitlist_count() to anon, authenticated;;
