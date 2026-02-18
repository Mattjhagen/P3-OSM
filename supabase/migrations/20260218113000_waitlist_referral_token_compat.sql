-- Referral-link compatibility fix:
-- 1) Backfill missing referral_code values for legacy rows.
-- 2) Allow create_waitlist_signup() to accept either referral_code or waitlist UUID token.

DO $$
DECLARE
  row_id uuid;
  generated_code text;
BEGIN
  FOR row_id IN
    SELECT id
    FROM public.waitlist
    WHERE referral_code IS NULL OR btrim(referral_code) = ''
  LOOP
    LOOP
      generated_code := public.random_referral_code(10);
      EXIT WHEN NOT EXISTS (
        SELECT 1
        FROM public.waitlist
        WHERE referral_code = generated_code
      );
    END LOOP;

    UPDATE public.waitlist
    SET referral_code = generated_code
    WHERE id = row_id
      AND (referral_code IS NULL OR btrim(referral_code) = '');
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_waitlist_signup(
  name_input text,
  email_input text,
  ref_code_input text default null
)
RETURNS TABLE(
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_email text := lower(trim(coalesce(email_input, '')));
  normalized_name text := trim(coalesce(name_input, ''));
  raw_ref text := trim(coalesce(ref_code_input, ''));
  normalized_ref text := upper(raw_ref);
  existing_row public.waitlist%rowtype;
  referrer_row public.waitlist%rowtype;
  inserted_row public.waitlist%rowtype;
  effective_referred_by uuid := null;
  generated_code text;
  queue_rank bigint;
  attempt integer;
BEGIN
  IF normalized_email = '' THEN
    RAISE EXCEPTION 'email is required' USING errcode = '22023';
  END IF;

  IF normalized_name = '' THEN
    normalized_name := split_part(normalized_email, '@', 1);
  END IF;

  SELECT *
  INTO existing_row
  FROM public.waitlist
  WHERE lower(email) = normalized_email
  LIMIT 1;

  IF FOUND THEN
    IF existing_row.referral_code IS NULL OR btrim(existing_row.referral_code) = '' THEN
      FOR attempt IN 1..10 LOOP
        generated_code := public.random_referral_code(10);

        BEGIN
          UPDATE public.waitlist
          SET referral_code = generated_code
          WHERE id = existing_row.id
            AND (referral_code IS NULL OR btrim(referral_code) = '');
          EXIT;
        EXCEPTION
          WHEN unique_violation THEN
            IF attempt = 10 THEN
              RAISE;
            END IF;
        END;
      END LOOP;

      SELECT *
      INTO existing_row
      FROM public.waitlist
      WHERE id = existing_row.id
      LIMIT 1;
    END IF;

    SELECT ranked.rn
    INTO queue_rank
    FROM (
      SELECT
        w.id,
        row_number() OVER (ORDER BY w.waitlist_score DESC, w.created_at ASC, w.id ASC) AS rn
      FROM public.waitlist w
    ) AS ranked
    WHERE ranked.id = existing_row.id;

    RETURN QUERY
    SELECT
      existing_row.id,
      existing_row.name,
      existing_row.email,
      existing_row.referral_code,
      existing_row.referred_by,
      existing_row.referral_count,
      existing_row.waitlist_score,
      coalesce(queue_rank, 1),
      true;
    RETURN;
  END IF;

  IF raw_ref <> '' THEN
    SELECT *
    INTO referrer_row
    FROM public.waitlist
    WHERE referral_code = normalized_ref
      OR lower(id::text) = lower(raw_ref)
    ORDER BY CASE WHEN referral_code = normalized_ref THEN 0 ELSE 1 END
    LIMIT 1;

    IF FOUND AND lower(referrer_row.email) <> normalized_email THEN
      effective_referred_by := referrer_row.id;
    END IF;
  END IF;

  FOR attempt IN 1..10 LOOP
    generated_code := public.random_referral_code(10);

    BEGIN
      INSERT INTO public.waitlist (
        name,
        email,
        status,
        created_at,
        referral_code,
        referred_by,
        referral_count,
        waitlist_score
      )
      VALUES (
        normalized_name,
        normalized_email,
        'PENDING',
        now(),
        generated_code,
        effective_referred_by,
        0,
        0
      )
      RETURNING * INTO inserted_row;

      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        SELECT *
        INTO existing_row
        FROM public.waitlist
        WHERE lower(email) = normalized_email
        LIMIT 1;

        IF FOUND THEN
          SELECT ranked.rn
          INTO queue_rank
          FROM (
            SELECT
              w.id,
              row_number() OVER (ORDER BY w.waitlist_score DESC, w.created_at ASC, w.id ASC) AS rn
            FROM public.waitlist w
          ) AS ranked
          WHERE ranked.id = existing_row.id;

          RETURN QUERY
          SELECT
            existing_row.id,
            existing_row.name,
            existing_row.email,
            existing_row.referral_code,
            existing_row.referred_by,
            existing_row.referral_count,
            existing_row.waitlist_score,
            coalesce(queue_rank, 1),
            true;
          RETURN;
        END IF;

        IF attempt = 10 THEN
          RAISE;
        END IF;
    END;
  END LOOP;

  IF inserted_row.id IS NULL THEN
    RAISE EXCEPTION 'unable to create waitlist signup';
  END IF;

  IF inserted_row.referred_by IS NOT NULL THEN
    UPDATE public.waitlist
    SET
      referral_count = coalesce(referral_count, 0) + 1,
      waitlist_score = coalesce(waitlist_score, 0) + 1
    WHERE id = inserted_row.referred_by;
  END IF;

  SELECT ranked.rn
  INTO queue_rank
  FROM (
    SELECT
      w.id,
      row_number() OVER (ORDER BY w.waitlist_score DESC, w.created_at ASC, w.id ASC) AS rn
    FROM public.waitlist w
  ) AS ranked
  WHERE ranked.id = inserted_row.id;

  RETURN QUERY
  SELECT
    inserted_row.id,
    inserted_row.name,
    inserted_row.email,
    inserted_row.referral_code,
    inserted_row.referred_by,
    inserted_row.referral_count,
    inserted_row.waitlist_score,
    coalesce(queue_rank, 1),
    false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_waitlist_signup(text, text, text) TO anon, authenticated;
