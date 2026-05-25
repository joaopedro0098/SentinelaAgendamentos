-- Busca confiável de usuário por e-mail (auth.users), inclusive e-mail não confirmado.

CREATE OR REPLACE FUNCTION public.admin_get_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT u.id
  FROM auth.users u
  WHERE lower(trim(u.email)) = lower(trim(p_email))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.admin_get_user_id_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_user_id_by_email(text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_lookup_user_by_email(p_email text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  _uid uuid;
  _norm_email text;
  _shop record;
  _status text;
  _is_subscriber boolean;
  _is_on_trial boolean;
  _status_label text;
  _email_confirmed boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  _norm_email := lower(trim(p_email));
  IF _norm_email = '' OR _norm_email NOT LIKE '%@%' THEN
    RETURN json_build_object('error', 'invalid_email');
  END IF;

  SELECT u.id, (u.email_confirmed_at IS NOT NULL)
  INTO _uid, _email_confirmed
  FROM auth.users u
  WHERE lower(trim(u.email)) = _norm_email
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  SELECT s.* INTO _shop
  FROM public.barbershops s
  WHERE s.owner_id = _uid
  LIMIT 1;

  _status := COALESCE(_shop.subscription_status::text, 'none');

  _is_subscriber := _status IN ('active', 'grace')
    OR (
      _status = 'cancelled'
      AND _shop.current_period_end IS NOT NULL
      AND _shop.current_period_end >= CURRENT_DATE
    );

  _is_on_trial := _status = 'trial';

  _status_label := CASE
    WHEN NOT _email_confirmed THEN 'E-mail não confirmado'
    WHEN _status = 'active' THEN 'Assinatura ativa'
    WHEN _status = 'grace' THEN 'Pagamento pendente (tolerância)'
    WHEN _status = 'cancelled' THEN 'Cancelada (acesso até vencimento)'
    WHEN _status = 'expired' THEN 'Assinatura inativa'
    WHEN _status = 'trial' THEN 'Teste grátis'
    ELSE 'Sem plano'
  END;

  RETURN json_build_object(
    'user_id', _uid,
    'email', _norm_email,
    'shop_name', COALESCE(_shop.display_name, '—'),
    'is_subscriber', _is_subscriber,
    'is_on_trial', _is_on_trial,
    'email_confirmed', _email_confirmed,
    'subscription_status', _status,
    'subscription_label', _status_label,
    'mp_subscription_id', _shop.mp_subscription_id,
    'current_period_end', _shop.current_period_end,
    'grace_until', _shop.grace_until
  );
END;
$$;
