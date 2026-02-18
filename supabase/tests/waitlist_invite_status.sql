begin;

create extension if not exists pgtap;

select plan(8);

select has_column('public', 'waitlist', 'invite_status', 'waitlist has invite_status column');
select has_column('public', 'waitlist', 'invited_at', 'waitlist has invited_at column');
select has_column('public', 'waitlist', 'onboarded_at', 'waitlist has onboarded_at column');
select has_column('public', 'waitlist', 'invite_batch_id', 'waitlist has invite_batch_id column');

set local role service_role;

truncate table public.waitlist restart identity cascade;

insert into public.waitlist (name, email, status, invite_status, created_at)
values
  ('Oldest', 'oldest@example.com', 'PENDING', 'pending', now() - interval '3 minutes'),
  ('Second', 'second@example.com', 'PENDING', 'pending', now() - interval '2 minutes'),
  ('Newest', 'newest@example.com', 'PENDING', 'pending', now() - interval '1 minute');

with next_batch as (
  select id
  from public.waitlist
  where invite_status = 'pending'
  order by created_at asc, id asc
  limit 2
)
update public.waitlist as w
set
  status = 'INVITED',
  invite_status = 'invited',
  invited_at = now(),
  invite_batch_id = 'test_batch_001'
from next_batch
where w.id = next_batch.id;

select is(
  (select count(*) from public.waitlist where invite_status = 'invited'),
  2::bigint,
  'invite-next update marks two rows as invited'
);

select is(
  (
    select string_agg(email, ',' order by created_at asc, id asc)
    from public.waitlist
    where invite_status = 'invited'
  ),
  'oldest@example.com,second@example.com',
  'invite-next update targets the oldest pending rows first'
);

select is(
  (select count(*) from public.waitlist where invite_status = 'invited' and invited_at is not null),
  2::bigint,
  'invite-next update sets invited_at for invited rows'
);

select is(
  (select count(*) from public.waitlist where invite_status = 'pending'),
  1::bigint,
  'invite-next update leaves remaining rows pending'
);

select * from finish();

rollback;
