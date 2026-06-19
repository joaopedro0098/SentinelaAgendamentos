-- Cadastro concluído = e-mail confirmado + verificação facial registrada.

CREATE OR REPLACE FUNCTION public.barbershop_signup_completed(s public.barbershops)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT
    s.owner_id IS NOT NULL
    AND NOT s.face_verification_pending
    AND EXISTS (
      SELECT 1
      FROM public.facial_embeddings fe
      WHERE fe.user_id = s.owner_id
    )
    AND EXISTS (
      SELECT 1
      FROM auth.users u
      WHERE u.id = s.owner_id
        AND u.email_confirmed_at IS NOT NULL
    );
$$;

CREATE OR REPLACE FUNCTION public.barbershop_signup_completed_date_sp(s public.barbershops)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT (
    GREATEST(
      (SELECT u.email_confirmed_at FROM auth.users u WHERE u.id = s.owner_id),
      (
        SELECT MIN(fe.created_at)
        FROM public.facial_embeddings fe
        WHERE fe.user_id = s.owner_id
      )
    ) AT TIME ZONE 'America/Sao_Paulo'
  )::date;
$$;

CREATE OR REPLACE FUNCTION public.admin_panel_metrics(p_start date, p_end date)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _start date;
  _end date;
  _new_signups int;
  _not_subscribed int;
  _trial int;
  _total int;
  _card int;
  _pix int;
  _churn int;
  _churn_rate numeric;
  _conversion numeric;
  _paid_in_period int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  _start := COALESCE(p_start, CURRENT_DATE);
  _end := COALESCE(p_end, CURRENT_DATE);
  IF _start > _end THEN
    _start := p_end;
    _end := p_start;
  END IF;

  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE NOT public.barbershop_ever_paid(s))::int,
    COUNT(*) FILTER (WHERE public.barbershop_ever_paid(s))::int
  INTO _new_signups, _not_subscribed, _paid_in_period
  FROM public.barbershops s
  WHERE s.owner_id IS NOT NULL
    AND NOT public.has_role(s.owner_id, 'admin'::public.app_role)
    AND public.barbershop_signup_completed(s)
    AND public.barbershop_signup_completed_date_sp(s) BETWEEN _start AND _end;

  SELECT COUNT(*)::int
  INTO _trial
  FROM public.barbershops s
  WHERE s.owner_id IS NOT NULL
    AND NOT public.has_role(s.owner_id, 'admin'::public.app_role)
    AND s.subscription_status = 'trial'::public.subscription_status
    AND CURRENT_DATE < (s.trial_started_at + 14)
    AND public.barbershop_trial_started_date_sp(s) BETWEEN _start AND _end;

  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (
      WHERE COALESCE(
        s.last_payment_method,
        CASE
          WHEN s.stripe_subscription_id IS NOT NULL AND btrim(s.stripe_subscription_id) <> '' THEN 'card'
          ELSE 'pix'
        END
      ) = 'card'
    )::int,
    COUNT(*) FILTER (
      WHERE COALESCE(
        s.last_payment_method,
        CASE
          WHEN s.stripe_subscription_id IS NOT NULL AND btrim(s.stripe_subscription_id) <> '' THEN 'card'
          ELSE 'pix'
        END
      ) = 'pix'
    )::int
  INTO _total, _card, _pix
  FROM public.barbershops s
  WHERE s.owner_id IS NOT NULL
    AND NOT public.has_role(s.owner_id, 'admin'::public.app_role)
    AND public.barbershop_ever_paid(s)
    AND public.barbershop_is_active_subscriber(s)
    AND public.barbershop_created_date_sp(s) BETWEEN _start AND _end;

  SELECT COUNT(*)::int
  INTO _churn
  FROM public.barbershops s
  WHERE s.owner_id IS NOT NULL
    AND NOT public.has_role(s.owner_id, 'admin'::public.app_role)
    AND public.barbershop_ever_paid(s)
    AND NOT public.barbershop_is_active_subscriber(s)
    AND s.current_period_end IS NOT NULL
    AND s.current_period_end BETWEEN _start AND _end;

  _churn_rate := CASE WHEN (_total + _churn) > 0
    THEN round(100.0 * _churn / (_total + _churn), 1)
    ELSE 0 END;

  _conversion := CASE WHEN _new_signups > 0
    THEN round(100.0 * _paid_in_period / _new_signups, 1)
    ELSE 0 END;

  RETURN json_build_object(
    'total_subscribers', _total,
    'subscribers_card', _card,
    'subscribers_pix', _pix,
    'trial_users', _trial,
    'new_signups', _new_signups,
    'not_subscribed', _not_subscribed,
    'churn_count', _churn,
    'churn_rate', _churn_rate,
    'conversion_rate', _conversion
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_new_signups_list(p_start date, p_end date)
RETURNS TABLE (
  email text,
  display_name text,
  contact_phone text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  _start date;
  _end date;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN;
  END IF;

  _start := COALESCE(p_start, CURRENT_DATE);
  _end := COALESCE(p_end, CURRENT_DATE);
  IF _start > _end THEN
    _start := p_end;
    _end := p_start;
  END IF;

  RETURN QUERY
  SELECT
    lower(trim(u.email))::text,
    COALESCE(nullif(trim(s.display_name), ''), '—')::text,
    s.contact_phone,
    GREATEST(
      u.email_confirmed_at,
      (
        SELECT MIN(fe.created_at)
        FROM public.facial_embeddings fe
        WHERE fe.user_id = s.owner_id
      )
    ) AS created_at
  FROM public.barbershops s
  JOIN auth.users u ON u.id = s.owner_id
  WHERE s.owner_id IS NOT NULL
    AND NOT public.has_role(s.owner_id, 'admin'::public.app_role)
    AND public.barbershop_signup_completed(s)
    AND public.barbershop_signup_completed_date_sp(s) BETWEEN _start AND _end
  ORDER BY created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.barbershop_signup_completed(public.barbershops) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.barbershop_signup_completed_date_sp(public.barbershops) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.barbershop_signup_completed(public.barbershops) TO authenticated;
GRANT EXECUTE ON FUNCTION public.barbershop_signup_completed_date_sp(public.barbershops) TO authenticated;
