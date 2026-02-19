create extension if not exists "pgcrypto";

create table if not exists public.support_conversations (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id),
    anon_session_id text,
    status text not null default 'open' check (status in ('open', 'pending_human', 'closed')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.support_conversations(id) on delete cascade,
    sender_type text not null check (sender_type in ('user', 'ai', 'admin', 'system')),
    content text not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create table if not exists public.support_actions (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.support_conversations(id) on delete cascade,
    user_id uuid not null references auth.users(id),
    action_type text not null,
    status text not null check (status in ('proposed', 'confirmed', 'executed', 'failed', 'denied', 'cancelled')),
    request jsonb not null,
    result jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_support_conversations_user_id on public.support_conversations(user_id);
create index if not exists idx_support_messages_conversation_id on public.support_messages(conversation_id);
create index if not exists idx_support_actions_conversation_id on public.support_actions(conversation_id);
create index if not exists idx_support_actions_user_id on public.support_actions(user_id);

drop trigger if exists update_support_conversations_updated_at on public.support_conversations;
create trigger update_support_conversations_updated_at
before update on public.support_conversations
for each row execute procedure public.update_updated_at_column();

drop trigger if exists update_support_actions_updated_at on public.support_actions;
create trigger update_support_actions_updated_at
before update on public.support_actions
for each row execute procedure public.update_updated_at_column();

alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_actions enable row level security;

drop policy if exists "support_conversations_select_own" on public.support_conversations;
create policy "support_conversations_select_own" on public.support_conversations
for select
using (user_id = auth.uid() or auth.role() = 'service_role');

drop policy if exists "support_conversations_insert_own_or_service" on public.support_conversations;
create policy "support_conversations_insert_own_or_service" on public.support_conversations
for insert
with check (
    auth.role() = 'service_role'
    or (user_id = auth.uid() and anon_session_id is null)
);

drop policy if exists "support_conversations_update_own_or_service" on public.support_conversations;
create policy "support_conversations_update_own_or_service" on public.support_conversations
for update
using (user_id = auth.uid() or auth.role() = 'service_role')
with check (user_id = auth.uid() or auth.role() = 'service_role');

drop policy if exists "support_messages_select_own" on public.support_messages;
create policy "support_messages_select_own" on public.support_messages
for select
using (
    auth.role() = 'service_role'
    or exists (
        select 1
        from public.support_conversations c
        where c.id = support_messages.conversation_id
          and c.user_id = auth.uid()
    )
);

drop policy if exists "support_messages_insert_own_or_service" on public.support_messages;
create policy "support_messages_insert_own_or_service" on public.support_messages
for insert
with check (
    auth.role() = 'service_role'
    or exists (
        select 1
        from public.support_conversations c
        where c.id = support_messages.conversation_id
          and c.user_id = auth.uid()
    )
);

drop policy if exists "support_actions_select_own_or_service" on public.support_actions;
create policy "support_actions_select_own_or_service" on public.support_actions
for select
using (user_id = auth.uid() or auth.role() = 'service_role');

drop policy if exists "support_actions_service_insert_only" on public.support_actions;
create policy "support_actions_service_insert_only" on public.support_actions
for insert
with check (auth.role() = 'service_role');

drop policy if exists "support_actions_service_update_only" on public.support_actions;
create policy "support_actions_service_update_only" on public.support_actions
for update
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
