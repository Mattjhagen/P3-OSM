-- B2B Developer API: orgs, org_members, api_keys, usage, audit_logs

-- orgs
create table if not exists public.orgs (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    owner_user_id uuid not null,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index if not exists idx_orgs_owner_user_id on public.orgs(owner_user_id);

-- org_members (role: owner, admin, developer, viewer)
create type public.org_member_role as enum ('owner', 'admin', 'developer', 'viewer');

create table if not exists public.org_members (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.orgs(id) on delete cascade,
    user_id uuid not null,
    role public.org_member_role not null default 'viewer',
    created_at timestamptz default now(),
    unique(org_id, user_id)
);

create index if not exists idx_org_members_org_id on public.org_members(org_id);
create index if not exists idx_org_members_user_id on public.org_members(user_id);

-- api_keys (store key_prefix + key_hash only; raw key shown once at creation)
create type public.api_key_status as enum ('active', 'revoked');

create table if not exists public.api_keys (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.orgs(id) on delete cascade,
    name text not null,
    key_prefix text not null,
    key_hash text not null,
    scopes text[] not null default '{}',
    status public.api_key_status not null default 'active',
    rpm_limit int not null default 60,
    rpd_limit int not null default 10000,
    created_at timestamptz default now(),
    revoked_at timestamptz
);

create index if not exists idx_api_keys_org_id on public.api_keys(org_id);
create index if not exists idx_api_keys_key_prefix on public.api_keys(key_prefix);
create index if not exists idx_api_keys_status on public.api_keys(status);

-- api_key_usage (per-request log for usage + rate limit counting)
create table if not exists public.api_key_usage (
    id uuid primary key default gen_random_uuid(),
    api_key_id uuid not null references public.api_keys(id) on delete cascade,
    path text not null,
    status_code int,
    latency_ms int,
    created_at timestamptz default now()
);

create index if not exists idx_api_key_usage_api_key_id on public.api_key_usage(api_key_id);
create index if not exists idx_api_key_usage_created_at on public.api_key_usage(created_at);

-- api_audit_logs (security events: key created/revoked, auth failures, rate limit)
create table if not exists public.api_audit_logs (
    id uuid primary key default gen_random_uuid(),
    org_id uuid references public.orgs(id) on delete set null,
    api_key_id uuid references public.api_keys(id) on delete set null,
    event_type text not null,
    ip text,
    user_agent text,
    meta jsonb default '{}',
    created_at timestamptz default now()
);

create index if not exists idx_api_audit_logs_org_id on public.api_audit_logs(org_id);
create index if not exists idx_api_audit_logs_created_at on public.api_audit_logs(created_at);

-- RLS: orgs
alter table public.orgs enable row level security;

drop policy if exists "orgs_select_member" on public.orgs;
create policy "orgs_select_member" on public.orgs
for select using (
    exists (
        select 1 from public.org_members m
        where m.org_id = orgs.id and m.user_id = auth.uid()
    )
);

drop policy if exists "orgs_insert_owner" on public.orgs;
create policy "orgs_insert_owner" on public.orgs
for insert with check (owner_user_id = auth.uid());

drop policy if exists "orgs_update_owner_admin" on public.orgs;
create policy "orgs_update_owner_admin" on public.orgs
for update using (
    exists (
        select 1 from public.org_members m
        where m.org_id = orgs.id and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
);

-- RLS: org_members
alter table public.org_members enable row level security;

drop policy if exists "org_members_select_member" on public.org_members;
create policy "org_members_select_member" on public.org_members
for select using (
    exists (
        select 1 from public.org_members m2
        where m2.org_id = org_members.org_id and m2.user_id = auth.uid()
    )
);

drop policy if exists "org_members_insert_owner_admin" on public.org_members;
create policy "org_members_insert_owner_admin" on public.org_members
for insert with check (
    exists (
        select 1 from public.org_members m
        where m.org_id = org_members.org_id and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
);

drop policy if exists "org_members_update_owner_admin" on public.org_members;
create policy "org_members_update_owner_admin" on public.org_members
for update using (
    exists (
        select 1 from public.org_members m
        where m.org_id = org_members.org_id and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
);

-- RLS: api_keys (org admin/owner can manage)
alter table public.api_keys enable row level security;

drop policy if exists "api_keys_select_org_admin" on public.api_keys;
create policy "api_keys_select_org_admin" on public.api_keys
for select using (
    exists (
        select 1 from public.org_members m
        where m.org_id = api_keys.org_id and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'developer', 'viewer')
    )
);

drop policy if exists "api_keys_insert_org_admin" on public.api_keys;
create policy "api_keys_insert_org_admin" on public.api_keys
for insert with check (
    exists (
        select 1 from public.org_members m
        where m.org_id = api_keys.org_id and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
);

drop policy if exists "api_keys_update_org_admin" on public.api_keys;
create policy "api_keys_update_org_admin" on public.api_keys
for update using (
    exists (
        select 1 from public.org_members m
        where m.org_id = api_keys.org_id and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
);

-- RLS: api_key_usage (org members can read their org's usage)
alter table public.api_key_usage enable row level security;

drop policy if exists "api_key_usage_select_org_member" on public.api_key_usage;
create policy "api_key_usage_select_org_member" on public.api_key_usage
for select using (
    exists (
        select 1 from public.api_keys k
        join public.org_members m on m.org_id = k.org_id and m.user_id = auth.uid()
        where k.id = api_key_usage.api_key_id
    )
);

-- Service role can insert (API server logs usage)
drop policy if exists "api_key_usage_insert_service" on public.api_key_usage;
create policy "api_key_usage_insert_service" on public.api_key_usage
for insert with check (auth.role() = 'service_role');

-- RLS: api_audit_logs (org admin/owner can read)
alter table public.api_audit_logs enable row level security;

drop policy if exists "api_audit_logs_select_org_admin" on public.api_audit_logs;
create policy "api_audit_logs_select_org_admin" on public.api_audit_logs
for select using (
    org_id is not null and exists (
        select 1 from public.org_members m
        where m.org_id = api_audit_logs.org_id and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
);

drop policy if exists "api_audit_logs_insert_service" on public.api_audit_logs;
create policy "api_audit_logs_insert_service" on public.api_audit_logs
for insert with check (auth.role() = 'service_role');
