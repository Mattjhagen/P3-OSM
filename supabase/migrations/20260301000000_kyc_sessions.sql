-- KYC sessions for investor demo (OpenKYC / IDKit pluggable provider)

create table if not exists public.kyc_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  provider text not null,
  provider_session_id text not null,
  status text not null default 'created',
  extracted jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_kyc_sessions_provider_session_id
  on public.kyc_sessions(provider_session_id);

create index if not exists idx_kyc_sessions_user_created_at
  on public.kyc_sessions(user_id, created_at desc);

drop trigger if exists update_kyc_sessions_updated_at on public.kyc_sessions;
create trigger update_kyc_sessions_updated_at
  before update on public.kyc_sessions
  for each row execute procedure public.update_updated_at_column();

alter table public.kyc_sessions enable row level security;

-- Service role can read/write all (backend uses service role)
create policy "Service role full access kyc_sessions"
  on public.kyc_sessions
  for all
  using (true)
  with check (true);

-- Authenticated users can select/update their own rows
create policy "Users can read own kyc_sessions"
  on public.kyc_sessions
  for select
  using (auth.uid() = user_id);

create policy "Users can update own kyc_sessions"
  on public.kyc_sessions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
