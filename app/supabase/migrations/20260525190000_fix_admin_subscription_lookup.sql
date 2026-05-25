-- Corrige flags de assinante no painel admin (alinhado ao status real em barbershops).

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
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  _norm_email := lower(trim(p_email));
  IF _norm_email = '' OR _norm_email NOT LIKE '%@%' THEN
    RETURN json_build_object('error', 'invalid_email');
  END IF;

  SELECT u.id INTO _uid
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

  _status_label := CASE _status
    WHEN 'active' THEN 'Assinatura ativa'
    WHEN 'grace' THEN 'Pagamento pendente (tolerância)'
    WHEN 'cancelled' THEN 'Cancelada (acesso até vencimento)'
    WHEN 'expired' THEN 'Assinatura inativa'
    WHEN 'trial' THEN 'Teste grátis'
    ELSE 'Sem plano'
  END;

  RETURN json_build_object(
    'user_id', _uid,
    'email', _norm_email,
    'shop_name', COALESCE(_shop.display_name, '—'),
    'is_subscriber', _is_subscriber,
    'is_on_trial', _is_on_trial,
    'subscription_status', _status,
    'subscription_label', _status_label,
    'mp_subscription_id', _shop.mp_subscription_id,
    'current_period_end', _shop.current_period_end,
    'grace_until', _shop.grace_until
  );
END;
$$;
