begin;

create extension if not exists pgtap;

select plan(5);

truncate table public.notification_outbox restart identity cascade;

insert into public.users (id, wallet_address, kyc_tier)
values
  ('88888888-8888-4888-8888-888888888888', '0x8888888888888888888888888888888888888888', 0)
on conflict (id) do nothing;

set local role service_role;

create temporary table tmp_enqueue as
select public.enqueue_notification(
  '88888888-8888-4888-8888-888888888888'::uuid,
  'alerts@example.com',
  'SEC_TRADE_EXECUTED',
  '{"Action":"Securities Purchase","Amount":"$100.00"}'::jsonb,
  'SEC_TRADE_EXECUTED:trade_123',
  now()
) as first_id;

create temporary table tmp_enqueue_dupe as
select public.enqueue_notification(
  '88888888-8888-4888-8888-888888888888'::uuid,
  'alerts@example.com',
  'SEC_TRADE_EXECUTED',
  '{"Action":"Securities Purchase","Amount":"$100.00"}'::jsonb,
  'SEC_TRADE_EXECUTED:trade_123',
  now()
) as second_id;

select ok(
  (select first_id from tmp_enqueue) is not null,
  'enqueue_notification returns an id'
);

select is(
  (select first_id from tmp_enqueue),
  (select second_id from tmp_enqueue_dupe),
  'duplicate idempotency key returns existing outbox id'
);

select is(
  (select count(*)::int from public.notification_outbox where idempotency_key = 'SEC_TRADE_EXECUTED:trade_123'),
  1::int,
  'duplicate idempotency key creates only one outbox row'
);

select is(
  (select status from public.notification_outbox where idempotency_key = 'SEC_TRADE_EXECUTED:trade_123'),
  'pending',
  'new outbox rows default to pending status'
);

select is(
  (select lower(to_email) from public.notification_outbox where idempotency_key = 'SEC_TRADE_EXECUTED:trade_123'),
  'alerts@example.com',
  'to_email is normalized to lowercase'
);

select * from finish();

rollback;
