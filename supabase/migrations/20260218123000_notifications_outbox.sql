-- Transactional notification outbox + auditable sensitive action events

create extension if not exists "pgcrypto";

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_events_user_created_at
  on public.audit_events(user_id, created_at desc);

create index if not exists idx_audit_events_type_created_at
  on public.audit_events(event_type, created_at desc);

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  to_email text not null,
  channel text not null default 'email',
  template_key text not null,
  template_data jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0,
  last_error text,
  send_after timestamptz not null default now(),
  sent_at timestamptz,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_notification_outbox_status_send_after
  on public.notification_outbox(status, send_after);

create index if not exists idx_notification_outbox_user_created_at
  on public.notification_outbox(user_id, created_at desc);

drop trigger if exists update_notification_outbox_updated_at on public.notification_outbox;
create trigger update_notification_outbox_updated_at
before update on public.notification_outbox
for each row execute procedure public.update_updated_at_column();

create or replace function public.enqueue_notification(
  p_user_id text,
  p_to_email text,
  p_template_key text,
  p_template_data jsonb,
  p_idempotency_key text,
  p_send_after timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required' using errcode = '22023';
  end if;

  if coalesce(trim(p_to_email), '') = '' then
    raise exception 'p_to_email is required' using errcode = '22023';
  end if;

  if coalesce(trim(p_template_key), '') = '' then
    raise exception 'p_template_key is required' using errcode = '22023';
  end if;

  if coalesce(trim(p_idempotency_key), '') = '' then
    raise exception 'p_idempotency_key is required' using errcode = '22023';
  end if;

  insert into public.notification_outbox (
    user_id,
    to_email,
    channel,
    template_key,
    template_data,
    status,
    attempts,
    send_after,
    idempotency_key
  )
  values (
    p_user_id,
    lower(trim(p_to_email)),
    'email',
    trim(p_template_key),
    coalesce(p_template_data, '{}'::jsonb),
    'pending',
    0,
    coalesce(p_send_after, now()),
    trim(p_idempotency_key)
  )
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is not null then
    return v_id;
  end if;

  select id
  into v_id
  from public.notification_outbox
  where idempotency_key = trim(p_idempotency_key)
  limit 1;

  return v_id;
end;
$$;

grant execute on function public.enqueue_notification(
  text,
  text,
  text,
  jsonb,
  text,
  timestamptz
) to service_role;

alter table public.audit_events disable row level security;
alter table public.notification_outbox disable row level security;

grant select, insert, update, delete on table public.audit_events to service_role;
grant select, insert, update, delete on table public.notification_outbox to service_role;
