-- Finance + trading persistence primitives for real pricing, fees, withdrawals, and Plaid links

create table if not exists public.ledger_transactions (
    id uuid primary key default uuid_generate_v4(),
    user_id text not null,
    type text not null,
    amount_usd numeric(18,2) not null,
    fee_usd numeric(18,2) not null default 0,
    net_amount_usd numeric(18,2) not null,
    currency text not null default 'USD',
    status text not null default 'pending',
    provider text,
    reference_id text,
    external_event_id text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_ledger_transactions_user_created_at
  on public.ledger_transactions(user_id, created_at desc);

create index if not exists idx_ledger_transactions_type_created_at
  on public.ledger_transactions(type, created_at desc);

create table if not exists public.platform_fee_accruals (
    id uuid primary key default uuid_generate_v4(),
    user_id text not null,
    action text not null,
    fee_usd numeric(18,2) not null,
    ledger_transaction_id uuid references public.ledger_transactions(id) on delete set null,
    reference_id text,
    settlement_target text not null default 'stripe',
    settlement_status text not null default 'pending',
    settled_at timestamptz,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_platform_fee_accruals_status_created_at
  on public.platform_fee_accruals(settlement_status, created_at desc);

create table if not exists public.crypto_orders (
    id uuid primary key default uuid_generate_v4(),
    user_id text not null,
    symbol text not null,
    side text not null check (side in ('BUY', 'SELL')),
    gross_amount_usd numeric(18,2) not null,
    fee_usd numeric(18,2) not null,
    net_amount_usd numeric(18,2) not null,
    quantity numeric(30,12) not null,
    executed_price_usd numeric(18,8) not null,
    status text not null check (status in ('pending', 'succeeded', 'failed')),
    provider text not null,
    provider_order_id text,
    failure_reason text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_crypto_orders_user_created_at
  on public.crypto_orders(user_id, created_at desc);

create index if not exists idx_crypto_orders_status_created_at
  on public.crypto_orders(status, created_at desc);

create table if not exists public.withdrawal_requests (
    id uuid primary key default uuid_generate_v4(),
    user_id text not null,
    method text not null check (method in ('STRIPE', 'BTC', 'BANK')),
    amount_usd numeric(18,2) not null,
    fee_usd numeric(18,2) not null,
    net_amount_usd numeric(18,2) not null,
    destination text not null,
    status text not null check (status in ('pending', 'succeeded', 'failed')),
    provider text not null,
    provider_reference text,
    failure_reason text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_withdrawal_requests_user_created_at
  on public.withdrawal_requests(user_id, created_at desc);

create index if not exists idx_withdrawal_requests_status_created_at
  on public.withdrawal_requests(status, created_at desc);

create table if not exists public.plaid_bank_links (
    id uuid primary key default uuid_generate_v4(),
    user_id text not null,
    plaid_item_id text not null,
    plaid_account_id text not null,
    account_mask text not null,
    institution_name text not null,
    processor_token text not null,
    status text not null default 'active',
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(user_id, plaid_account_id)
);

create index if not exists idx_plaid_bank_links_user_created_at
  on public.plaid_bank_links(user_id, created_at desc);

drop trigger if exists update_crypto_orders_updated_at on public.crypto_orders;
create trigger update_crypto_orders_updated_at
before update on public.crypto_orders
for each row execute procedure public.update_updated_at_column();

drop trigger if exists update_withdrawal_requests_updated_at on public.withdrawal_requests;
create trigger update_withdrawal_requests_updated_at
before update on public.withdrawal_requests
for each row execute procedure public.update_updated_at_column();

drop trigger if exists update_plaid_bank_links_updated_at on public.plaid_bank_links;
create trigger update_plaid_bank_links_updated_at
before update on public.plaid_bank_links
for each row execute procedure public.update_updated_at_column();

alter table public.ledger_transactions disable row level security;
alter table public.platform_fee_accruals disable row level security;
alter table public.crypto_orders disable row level security;
alter table public.withdrawal_requests disable row level security;
alter table public.plaid_bank_links disable row level security;
