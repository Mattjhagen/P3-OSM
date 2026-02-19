create or replace function public.create_waitlist_signup(
  name_input text,
  email_input text,
  ref_code_input text default null
)
returns table(
  signup_id uuid,
  name text,
  email text,
  referral_code text,
  referred_by uuid,
  referral_count integer,
  waitlist_score integer,
  queue_position bigint,
  is_existing boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(coalesce(email_input, '')));
  normalized_name text := trim(coalesce(name_input, ''));
  normalized_ref text := upper(trim(coalesce(ref_code_input, '')));
  existing_row public.waitlist%rowtype;
  referrer_row public.waitlist%rowtype;
  inserted_row public.waitlist%rowtype;
  effective_referred_by uuid := null;
  generated_code text;
  queue_rank bigint;
  attempt integer;
begin
  if normalized_email = '' then
    raise exception 'email is required' using errcode = '22023';
  end if;

  if normalized_name = '' then
    normalized_name := split_part(normalized_email, '@', 1);
  end if;

  select *
  into existing_row
  from public.waitlist as w
  where lower(w.email) = normalized_email
  limit 1;

  if found then
    select ranked.rn
    into queue_rank
    from (
      select
        w.id,
        row_number() over (order by w.waitlist_score desc, w.created_at asc, w.id asc) as rn
      from public.waitlist w
    ) as ranked
    where ranked.id = existing_row.id;

    return query
    select
      existing_row.id,
      existing_row.name,
      existing_row.email,
      existing_row.referral_code,
      existing_row.referred_by,
      existing_row.referral_count,
      existing_row.waitlist_score,
      coalesce(queue_rank, 1),
      true;
    return;
  end if;

  if normalized_ref <> '' then
    select *
    into referrer_row
    from public.waitlist as w
    where w.referral_code = normalized_ref
    limit 1;

    if found and lower(referrer_row.email) <> normalized_email then
      effective_referred_by := referrer_row.id;
    end if;
  end if;

  for attempt in 1..10 loop
    generated_code := public.random_referral_code(10);

    begin
      insert into public.waitlist (
        name,
        email,
        status,
        created_at,
        referral_code,
        referred_by,
        referral_count,
        waitlist_score
      )
      values (
        normalized_name,
        normalized_email,
        'PENDING',
        now(),
        generated_code,
        effective_referred_by,
        0,
        0
      )
      returning * into inserted_row;

      exit;
    exception
      when unique_violation then
        select *
        into existing_row
        from public.waitlist as w
        where lower(w.email) = normalized_email
        limit 1;

        if found then
          select ranked.rn
          into queue_rank
          from (
            select
              w.id,
              row_number() over (order by w.waitlist_score desc, w.created_at asc, w.id asc) as rn
            from public.waitlist w
          ) as ranked
          where ranked.id = existing_row.id;

          return query
          select
            existing_row.id,
            existing_row.name,
            existing_row.email,
            existing_row.referral_code,
            existing_row.referred_by,
            existing_row.referral_count,
            existing_row.waitlist_score,
            coalesce(queue_rank, 1),
            true;
          return;
        end if;

        if attempt = 10 then
          raise;
        end if;
    end;
  end loop;

  if inserted_row.id is null then
    raise exception 'unable to create waitlist signup';
  end if;

  if inserted_row.referred_by is not null then
    update public.waitlist as w
    set
      referral_count = coalesce(w.referral_count, 0) + 1,
      waitlist_score = coalesce(w.waitlist_score, 0) + 1
    where w.id = inserted_row.referred_by;
  end if;

  select ranked.rn
  into queue_rank
  from (
    select
      w.id,
      row_number() over (order by w.waitlist_score desc, w.created_at asc, w.id asc) as rn
    from public.waitlist w
  ) as ranked
  where ranked.id = inserted_row.id;

  return query
  select
    inserted_row.id,
    inserted_row.name,
    inserted_row.email,
    inserted_row.referral_code,
    inserted_row.referred_by,
    inserted_row.referral_count,
    inserted_row.waitlist_score,
    coalesce(queue_rank, 1),
    false;
end;
$$;

