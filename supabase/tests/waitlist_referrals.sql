begin;

create extension if not exists pgtap;

select plan(8);

truncate table public.waitlist restart identity cascade;

set local role anon;

create temporary table tmp_referrer as
select *
from public.create_waitlist_signup('Referrer User', 'referrer@example.com', null);

select ok(
  length((select referral_code from tmp_referrer)) >= 8,
  'new waitlist signup receives a referral code'
);

create temporary table tmp_child as
select *
from public.create_waitlist_signup(
  'Child User',
  'child@example.com',
  (select referral_code from tmp_referrer)
);

select is(
  (select referred_by from tmp_child),
  (select signup_id from tmp_referrer),
  'referred signup is attributed to the referrer'
);

set local role service_role;

select is(
  (select referral_count from public.waitlist where id = (select signup_id from tmp_referrer)),
  1::integer,
  'referrer referral_count increments once on successful referral'
);

select is(
  (select waitlist_score from public.waitlist where id = (select signup_id from tmp_referrer)),
  1::integer,
  'referrer waitlist_score increments on successful referral'
);

set local role anon;

create temporary table tmp_duplicate as
select *
from public.create_waitlist_signup(
  'Child User',
  'child@example.com',
  (select referral_code from tmp_referrer)
);

select ok(
  (select is_existing from tmp_duplicate),
  'duplicate email signup returns existing record'
);

set local role service_role;

select is(
  (select referral_count from public.waitlist where id = (select signup_id from tmp_referrer)),
  1::integer,
  'duplicate signup does not increment referral_count again'
);

set local role anon;

create temporary table tmp_self as
select *
from public.create_waitlist_signup('Self User', 'self@example.com', null);

create temporary table tmp_self_duplicate as
select *
from public.create_waitlist_signup(
  'Self User',
  'self@example.com',
  (select referral_code from tmp_self)
);

set local role service_role;

select is(
  (select referral_count from public.waitlist where id = (select signup_id from tmp_self)),
  0::integer,
  'self referral attempts do not award credit'
);

set local role anon;

create temporary table tmp_rank as
select *
from public.waitlist_position('referrer@example.com');

select is(
  (select queue_position from tmp_rank),
  1::bigint,
  'referrer moves to the top by score-based ranking after referral'
);

select * from finish();

rollback;
