create extension if not exists "pgcrypto";

create table if not exists public.tickets (
    id uuid primary key default gen_random_uuid(),
    type text not null default 'support',
    source text,
    created_by uuid references auth.users(id),
    status text not null default 'open',
    data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.tickets add column if not exists type text not null default 'support';
alter table public.tickets add column if not exists source text;
alter table public.tickets add column if not exists created_by uuid references auth.users(id);
alter table public.tickets add column if not exists status text not null default 'open';
alter table public.tickets add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.tickets add column if not exists created_at timestamptz not null default now();
alter table public.tickets add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_tickets_created_by on public.tickets(created_by);
create index if not exists idx_tickets_type on public.tickets(type);
create index if not exists idx_tickets_status on public.tickets(status);

drop trigger if exists update_tickets_updated_at on public.tickets;
create trigger update_tickets_updated_at
before update on public.tickets
for each row execute procedure public.update_updated_at_column();

alter table public.tickets enable row level security;

drop policy if exists "tickets_select_own_or_admin_or_service" on public.tickets;
create policy "tickets_select_own_or_admin_or_service" on public.tickets
for select
using (
    created_by = auth.uid()
    or public.current_is_admin()
    or auth.role() = 'service_role'
);

drop policy if exists "tickets_insert_authenticated_own_or_service" on public.tickets;
create policy "tickets_insert_authenticated_own_or_service" on public.tickets
for insert
with check (
    auth.role() = 'service_role'
    or (auth.role() = 'authenticated' and created_by = auth.uid())
);

drop policy if exists "tickets_update_own_or_admin_or_service" on public.tickets;
create policy "tickets_update_own_or_admin_or_service" on public.tickets
for update
using (
    created_by = auth.uid()
    or public.current_is_admin()
    or auth.role() = 'service_role'
)
with check (
    created_by = auth.uid()
    or public.current_is_admin()
    or auth.role() = 'service_role'
);
