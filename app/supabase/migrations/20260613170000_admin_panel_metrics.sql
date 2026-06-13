-- Painel admin ampliado: contato do barbeiro, churn, conversão, novos cadastros e "não assinaram".

ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS contact_phone text;

COMMENT ON COLUMN public.barbershops.contact_phone IS
  'Telefone de contato do dono (privado, usado pelo suporte). Não exposto no link público.';

-- Já assinou alguma vez (tem histórico de pagamento card/pix).
CREATE OR REPLACE FUNCTION public.barbershop_ever_paid(s public.barbershops)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  -- Sinais confiáveis de assinatura paga (o trial não cria assinatura/forma de pagamento).
  SELECT
    (s.last_payment_method IS NOT NULL AND btrim(s.last_payment_method) <> '')
    OR (s.stripe_subscription_id IS NOT NULL AND btrim(s.stripe_subscription_id) <> '')
    OR (s.mp_subscription_id IS NOT NULL AND btrim(s.mp_subscription_id) <> '');
$$;

-- É assinante ativo hoje (inclui carência e cancelado com período em aberto).
CREATE OR REPLACE FUNCTION public.barbershop_is_active_subscriber(s public.barbershops)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    s.subscription_status IN ('active'::public.subscription_status, 'grace'::public.subscription_status)
    OR (
      s.subscription_status = 'cancelled'::public.subscription_status
      AND s.current_period_end IS NOT NULL
      AND s.current_period_end >= CURRENT_DATE
    );
$$;

-- Snapshot global de assinaturas para o painel admin.
CREATE OR REPLACE FUNCTION public.admin_subscription_stats()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total int;
  _card int;
  _pix int;
  _trial int;
  _signups int;
  _ever_paid int;
  _churn int;
  _churn_rate numeric;
  _conversion numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  -- Assinantes ativos e forma de pagamento.
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
  WHERE s.subscription_status = 'active'::public.subscription_status
    AND s.owner_id IS NOT NULL
    AND NOT public.has_role(s.owner_id, 'admin'::public.app_role);

  -- Em teste.
  SELECT COUNT(*)::int
  INTO _trial
  FROM public.barbershops s
  WHERE s.subscription_status = 'trial'::public.subscription_status
    AND CURRENT_DATE < (s.trial_started_at + 14)
    AND s.owner_id IS NOT NULL
    AND NOT public.has_role(s.owner_id, 'admin'::public.app_role);

  -- Total de cadastros e quem já pagou alguma vez (histórico).
  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE public.barbershop_ever_paid(s))::int
  INTO _signups, _ever_paid
  FROM public.barbershops s
  WHERE s.owner_id IS NOT NULL
    AND NOT public.has_role(s.owner_id, 'admin'::public.app_role);

  -- Churn: já pagou alguma vez e hoje não é assinante ativo.
  SELECT COUNT(*)::int
  INTO _churn
  FROM public.barbershops s
  WHERE s.owner_id IS NOT NULL
    AND NOT public.has_role(s.owner_id, 'admin'::public.app_role)
    AND public.barbershop_ever_paid(s)
    AND NOT public.barbershop_is_active_subscriber(s);

  _churn_rate := CASE WHEN _ever_paid > 0
    THEN round(100.0 * _churn / _ever_paid, 1)
    ELSE 0 END;

  _conversion := CASE WHEN _signups > 0
    THEN round(100.0 * _ever_paid / _signups, 1)
    ELSE 0 END;

  RETURN json_build_object(
    'total_subscribers', _total,
    'subscribers_card', _card,
    'subscribers_pix', _pix,
    'trial_users', _trial,
    'total_signups', _signups,
    'ever_paid', _ever_paid,
    'churn_count', _churn,
    'churn_rate', _churn_rate,
    'conversion_rate', _conversion
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_subscription_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_subscription_stats() TO authenticated;

-- Métricas mensais: novos cadastros e "não assinaram" (por mês do cadastro).
CREATE OR REPLACE FUNCTION public.admin_month_metrics(p_month date)
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
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  _start := date_trunc('month', COALESCE(p_month, CURRENT_DATE))::date;
  _end := (_start + interval '1 month')::date;

  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE NOT public.barbershop_ever_paid(s))::int
  INTO _new_signups, _not_subscribed
  FROM public.barbershops s
  WHERE s.owner_id IS NOT NULL
    AND NOT public.has_role(s.owner_id, 'admin'::public.app_role)
    AND (s.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= _start
    AND (s.created_at AT TIME ZONE 'America/Sao_Paulo')::date < _end;

  RETURN json_build_object(
    'new_signups', _new_signups,
    'not_subscribed', _not_subscribed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_month_metrics(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_month_metrics(date) TO authenticated;

-- Lista de quem fez o teste e não assinou no mês (nome + contato), para remarketing.
CREATE OR REPLACE FUNCTION public.admin_not_subscribed_list(p_month date)
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

  _start := date_trunc('month', COALESCE(p_month, CURRENT_DATE))::date;
  _end := (_start + interval '1 month')::date;

  RETURN QUERY
  SELECT
    COALESCE(s.display_name, '—'),
    s.contact_phone,
    s.created_at
  FROM public.barbershops s
  WHERE s.owner_id IS NOT NULL
    AND NOT public.has_role(s.owner_id, 'admin'::public.app_role)
    AND NOT public.barbershop_ever_paid(s)
    AND (s.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= _start
    AND (s.created_at AT TIME ZONE 'America/Sao_Paulo')::date < _end
  ORDER BY s.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_not_subscribed_list(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_not_subscribed_list(date) TO authenticated;
