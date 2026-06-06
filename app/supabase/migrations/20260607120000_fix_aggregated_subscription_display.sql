-- Corrige exibição de assinatura para contas agregadas ativas.

CREATE OR REPLACE FUNCTION public.get_my_subscription()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  _shop record;
  _billing_shop record;
  _trial_end date;
  _trial_days_left int;
  _can_book boolean;
  _barbearia_id uuid;
  _email text;
  _trial_already_used boolean;
  _facial_trial_used boolean;
  _my_embedding real[];
  _agg_owner_id uuid;
  _agg_owner_email text;
  _billing_owner_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN json_build_object(
      'is_admin', true,
      'can_book', true,
      'subscription_status', 'active',
      'trial_already_used', false,
      'facial_trial_used', false,
      'label', 'Administrador — acesso ilimitado',
      'is_aggregated_account', false,
      'can_manage_aggregated_accounts', true
    );
  END IF;

  SELECT s.* INTO _shop
  FROM public.barbershops s
  WHERE s.owner_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'no_shop', 'can_book', false);
  END IF;

  SELECT aa.owner_user_id, lower(trim(ou.email))
  INTO _agg_owner_id, _agg_owner_email
  FROM public.aggregated_accounts aa
  JOIN auth.users ou ON ou.id = aa.owner_user_id
  WHERE aa.aggregated_user_id = auth.uid()
    AND aa.status = 'active'::public.aggregated_account_status
  LIMIT 1;

  _billing_owner_id := COALESCE(_agg_owner_id, auth.uid());

  SELECT s.* INTO _billing_shop
  FROM public.barbershops s
  WHERE s.owner_id = _billing_owner_id
  LIMIT 1;

  SELECT lower(trim(u.email)) INTO _email
  FROM auth.users u
  WHERE u.id = auth.uid();

  _trial_already_used := _email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.trial_claims tc WHERE tc.email = _email
  );

  SELECT fe.embedding INTO _my_embedding
  FROM public.facial_embeddings fe
  WHERE fe.user_id = auth.uid()
  ORDER BY fe.created_at DESC
  LIMIT 1;

  _facial_trial_used := _my_embedding IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.facial_embeddings fe
    WHERE fe.user_id IS DISTINCT FROM auth.uid()
      AND public.face_descriptor_distance(fe.embedding, _my_embedding) < 0.55
  );

  SELECT b.id INTO _barbearia_id
  FROM public.barbearias b
  WHERE b.slug = _shop.slug
  LIMIT 1;

  _can_book := _barbearia_id IS NOT NULL
    AND public.barbearia_pode_agendar(_barbearia_id);

  _trial_end := _shop.trial_started_at + 13;
  _trial_days_left := GREATEST(0, (_shop.trial_started_at + 14) - CURRENT_DATE);

  IF _agg_owner_id IS NOT NULL THEN
    _trial_days_left := GREATEST(0, (_billing_shop.trial_started_at + 14) - CURRENT_DATE);
    _trial_end := _billing_shop.trial_started_at + 13;

    RETURN json_build_object(
      'is_admin', false,
      'can_book', _can_book,
      'subscription_status', _billing_shop.subscription_status,
      'trial_started_at', _billing_shop.trial_started_at,
      'trial_days_left', _trial_days_left,
      'trial_last_day', _trial_end,
      'trial_already_used', true,
      'facial_trial_used', _facial_trial_used,
      'current_period_end', _billing_shop.current_period_end,
      'grace_until', _billing_shop.grace_until,
      'subscription_notice', CASE
        WHEN _can_book THEN NULL
        ELSE COALESCE(
          _billing_shop.subscription_notice,
          'O plano de quem agregou sua conta está inativo. Novos agendamentos estão bloqueados.'
        )
      END,
      'mp_subscription_id', _billing_shop.mp_subscription_id,
      'stripe_subscription_id', _shop.stripe_subscription_id,
      'plan_price_label', 'R$ 29,90/mês',
      'is_aggregated_account', true,
      'aggregated_by_email', _agg_owner_email,
      'can_manage_aggregated_accounts', false,
      'own_subscription_status', _shop.subscription_status
    );
  END IF;

  RETURN json_build_object(
    'is_admin', false,
    'can_book', _can_book,
    'subscription_status', _shop.subscription_status,
    'trial_started_at', _shop.trial_started_at,
    'trial_days_left', _trial_days_left,
    'trial_last_day', _trial_end,
    'trial_already_used', _trial_already_used,
    'facial_trial_used', _facial_trial_used,
    'current_period_end', _shop.current_period_end,
    'grace_until', _shop.grace_until,
    'subscription_notice', _shop.subscription_notice,
    'mp_subscription_id', _shop.mp_subscription_id,
    'stripe_subscription_id', _shop.stripe_subscription_id,
    'plan_price_label', 'R$ 29,90/mês',
    'is_aggregated_account', false,
    'can_manage_aggregated_accounts', NOT EXISTS (
      SELECT 1
      FROM public.aggregated_accounts aa
      WHERE aa.aggregated_user_id = auth.uid()
        AND aa.status IN ('awaiting_face', 'active')
    )
  );
END;
$$;
