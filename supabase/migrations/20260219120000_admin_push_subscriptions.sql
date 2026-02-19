create table if not exists public.admin_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id text not null,
  admin_email text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_push_subscriptions_admin_user
  on public.admin_push_subscriptions (admin_user_id);

alter table public.admin_push_subscriptions enable row level security;

drop policy if exists "Admins can view own push subscriptions" on public.admin_push_subscriptions;
create policy "Admins can view own push subscriptions"
  on public.admin_push_subscriptions
  for select
  using (
    auth.uid()::text = admin_user_id
    and (
      (auth.jwt() -> 'app_metadata' ->> 'p3_role') in ('admin', 'risk_officer', 'support')
      or exists (
        select 1
        from jsonb_array_elements_text(coalesce(auth.jwt() -> 'app_metadata' -> 'p3_roles', '[]'::jsonb)) as r(role)
        where lower(r.role) in ('admin', 'risk_officer', 'support')
      )
    )
  );

drop policy if exists "Admins can insert own push subscriptions" on public.admin_push_subscriptions;
create policy "Admins can insert own push subscriptions"
  on public.admin_push_subscriptions
  for insert
  with check (
    auth.uid()::text = admin_user_id
    and (
      (auth.jwt() -> 'app_metadata' ->> 'p3_role') in ('admin', 'risk_officer', 'support')
      or exists (
        select 1
        from jsonb_array_elements_text(coalesce(auth.jwt() -> 'app_metadata' -> 'p3_roles', '[]'::jsonb)) as r(role)
        where lower(r.role) in ('admin', 'risk_officer', 'support')
      )
    )
  );

drop policy if exists "Admins can delete own push subscriptions" on public.admin_push_subscriptions;
create policy "Admins can delete own push subscriptions"
  on public.admin_push_subscriptions
  for delete
  using (
    auth.uid()::text = admin_user_id
    and (
      (auth.jwt() -> 'app_metadata' ->> 'p3_role') in ('admin', 'risk_officer', 'support')
      or exists (
        select 1
        from jsonb_array_elements_text(coalesce(auth.jwt() -> 'app_metadata' -> 'p3_roles', '[]'::jsonb)) as r(role)
        where lower(r.role) in ('admin', 'risk_officer', 'support')
      )
    )
  );
