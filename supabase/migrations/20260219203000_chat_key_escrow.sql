create table if not exists public.chat_key_escrow (
    key_ref text primary key,
    owner_user_id uuid references auth.users(id),
    anon_session_id text,
    wrapped_dek text not null,
    wrap_iv text not null,
    wrap_alg text not null default 'AES-GCM',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_chat_key_escrow_owner_user on public.chat_key_escrow(owner_user_id);
create index if not exists idx_chat_key_escrow_anon_session on public.chat_key_escrow(anon_session_id);

drop trigger if exists update_chat_key_escrow_updated_at on public.chat_key_escrow;
create trigger update_chat_key_escrow_updated_at
before update on public.chat_key_escrow
for each row execute procedure public.update_updated_at_column();

alter table public.chat_key_escrow enable row level security;

drop policy if exists "chat_key_escrow_service_select" on public.chat_key_escrow;
create policy "chat_key_escrow_service_select" on public.chat_key_escrow
for select
using (auth.role() = 'service_role');

drop policy if exists "chat_key_escrow_service_insert" on public.chat_key_escrow;
create policy "chat_key_escrow_service_insert" on public.chat_key_escrow
for insert
with check (auth.role() = 'service_role');

drop policy if exists "chat_key_escrow_service_update" on public.chat_key_escrow;
create policy "chat_key_escrow_service_update" on public.chat_key_escrow
for update
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
