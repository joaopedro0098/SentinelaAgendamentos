-- Painel admin: métricas unificadas por intervalo de datas (início e fim, inclusive).

CREATE OR REPLACE FUNCTION public.barbershop_created_date_sp(s public.barbershops)
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (s.created_at AT TIME ZONE 'America/Sao_Paulo')::date;
$$;

CREATE OR REPLACE FUNCTION public.barbershop_trial_started_date_sp(s public.barbershops)
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (s.trial_started_at AT TIME ZONE 'America/Sao_Paulo')::date;
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

  -- Novos cadastros e não assinaram (data do cadastro no intervalo).
  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE NOT public.barbershop_ever_paid(s))::int,
    COUNT(*) FILTER (WHERE public.barbershop_ever_paid(s))::int
  INTO _new_signups, _not_subscribed, _paid_in_period
  FROM public.barbershops s
  WHERE s.owner_id IS NOT NULL
    AND NOT public.has_role(s.owner_id, 'admin'::public.app_role)
    AND public.barbershop_created_date_sp(s) BETWEEN _start AND _end;

  -- Em teste: iniciou o trial no intervalo e ainda está no trial válido.
  SELECT COUNT(*)::int
  INTO _trial
  FROM public.barbershops s
  WHERE s.owner_id IS NOT NULL
    AND NOT public.has_role(s.owner_id, 'admin'::public.app_role)
    AND s.subscription_status = 'trial'::public.subscription_status
    AND CURRENT_DATE < (s.trial_started_at + 14)
    AND public.barbershop_trial_started_date_sp(s) BETWEEN _start AND _end;

  -- Assinantes ativos: assinou (ever_paid) no intervalo e continua ativo hoje.
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

  -- Churn no intervalo: já pagou, não está ativo, e o fim do período pago cai no intervalo.
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

REVOKE ALL ON FUNCTION public.admin_panel_metrics(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_panel_metrics(date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_not_subscribed_list(p_start date, p_end date)
RETURNS TABLE (
  display_name text,
  contact_phone text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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
    COALESCE(s.display_name, '—'),
    s.contact_phone,
    s.created_at
  FROM public.barbershops s
  WHERE s.owner_id IS NOT NULL
    AND NOT public.has_role(s.owner_id, 'admin'::public.app_role)
    AND NOT public.barbershop_ever_paid(s)
    AND public.barbershop_created_date_sp(s) BETWEEN _start AND _end
  ORDER BY s.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_not_subscribed_list(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_not_subscribed_list(date, date) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_not_subscribed_list(date);
