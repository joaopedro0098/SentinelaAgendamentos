-- AA/CA não devem ver aviso de assinatura própria do titular CT expirado.

UPDATE public.barbershops
SET subscription_notice = NULL
WHERE is_admin_aggregated = true
  AND subscription_notice IS NOT NULL;

CREATE OR REPLACE FUNCTION public.admin_set_admin_aggregated(p_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  norm_email    text;
  _target_id    uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  norm_email := lower(trim(p_email));
  IF norm_email IS NULL OR norm_email = '' OR position('@' IN norm_email) = 0 THEN
    RETURN json_build_object('error', 'invalid_email');
  END IF;

  SELECT u.id INTO _target_id
  FROM auth.users u
  WHERE lower(trim(u.email)) = norm_email
  LIMIT 1;

  IF _target_id IS NULL THEN
    RETURN json_build_object('error', 'user_not_found');
  END IF;

  IF public.has_role(_target_id, 'admin'::public.app_role) THEN
    RETURN json_build_object('error', 'cannot_set_admin_as_aa');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.aggregated_accounts aa
    WHERE aa.aggregated_user_id = _target_id
      AND aa.status IN ('awaiting_face', 'active')
  ) THEN
    RETURN json_build_object('error', 'target_is_ca');
  END IF;

  UPDATE public.barbershops
  SET
    is_admin_aggregated = true,
    subscription_notice = NULL
  WHERE owner_id = _target_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'shop_not_found');
  END IF;

  INSERT INTO public.trial_claims (email, user_id)
  VALUES (norm_email, _target_id)
  ON CONFLICT (email) DO NOTHING;

  RETURN json_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_subscription()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  _shop              record;
  _billing_shop      record;
  _trial_end         date;
  _trial_days_left   int;
  _can_book          boolean;
  _barbearia_id      uuid;
  _email             text;
  _trial_already_used boolean;
  _facial_trial_used  boolean;
  _my_embedding      real[];
  _agg               record;
  _billing_owner_id  uuid;
  _has_editable_ca   boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN json_build_object(
      'is_admin',                    true,
      'can_book',                    true,
      'subscription_status',         'active',
      'trial_already_used',          false,
      'facial_trial_used',           false,
      'label',                       'Administrador — acesso ilimitado',
      'is_aggregated_account',       false,
      'is_admin_aggregated',         false,
      'can_manage_aggregated_accounts', true,
      'account_type',                'admin',
      'subscription_notice',         NULL,
      'titular_has_editable_ca_appointments', false
    );
  END IF;

  SELECT s.* INTO _shop
  FROM public.barbershops s
  WHERE s.owner_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'no_shop', 'can_book', false);
  END IF;

  -- AA antes de CA: isenta de avisos de assinatura própria.
  IF _shop.is_admin_aggregated THEN
    SELECT b.id INTO _barbearia_id
    FROM public.barbearias b
    WHERE b.slug = _shop.slug
    LIMIT 1;

    _can_book := _barbearia_id IS NOT NULL
      AND public.barbearia_pode_agendar(_barbearia_id);

    SELECT EXISTS (
      SELECT 1
      FROM public.aggregated_accounts aa
      WHERE aa.owner_user_id = auth.uid()
        AND aa.status = 'active'::public.aggregated_account_status
        AND aa.owner_can_view_appointments = true
        AND aa.owner_can_edit_appointments = true
    )
    INTO _has_editable_ca;

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

    RETURN json_build_object(
      'is_admin',                    false,
      'can_book',                    _can_book,
      'subscription_status',         'active',
      'trial_already_used',          true,
      'facial_trial_used',           _facial_trial_used,
      'label',                       'Conta especial — acesso garantido pelo administrador',
      'plan_price_label',            'R$ 29,90/mês',
      'is_aggregated_account',       false,
      'is_admin_aggregated',         true,
      'can_manage_aggregated_accounts', true,
      'account_type',                'aa',
      'subscription_notice',         NULL,
      'titular_has_editable_ca_appointments', _has_editable_ca
    );
  END IF;

  SELECT
    aa.owner_user_id,
    lower(trim(ou.email)) AS owner_email,
    aa.owner_can_view_appointments,
    aa.owner_can_edit_appointments
  INTO _agg
  FROM public.aggregated_accounts aa
  JOIN auth.users ou ON ou.id = aa.owner_user_id
  WHERE aa.aggregated_user_id = auth.uid()
    AND aa.status = 'active'::public.aggregated_account_status
  LIMIT 1;

  _billing_owner_id := COALESCE(_agg.owner_user_id, auth.uid());

  SELECT EXISTS (
    SELECT 1
    FROM public.aggregated_accounts aa
    WHERE aa.owner_user_id = auth.uid()
      AND aa.status = 'active'::public.aggregated_account_status
      AND aa.owner_can_view_appointments = true
      AND aa.owner_can_edit_appointments = true
  )
  INTO _has_editable_ca;

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

  _trial_end       := _shop.trial_started_at + 13;
  _trial_days_left := GREATEST(0, (_shop.trial_started_at + 14) - CURRENT_DATE);

  IF _agg.owner_user_id IS NOT NULL THEN
    _trial_days_left := GREATEST(0, (_billing_shop.trial_started_at + 14) - CURRENT_DATE);
    _trial_end       := _billing_shop.trial_started_at + 13;

    RETURN json_build_object(
      'is_admin',                    false,
      'can_book',                    _can_book,
      'subscription_status',         _billing_shop.subscription_status,
      'trial_started_at',            _billing_shop.trial_started_at,
      'trial_days_left',             _trial_days_left,
      'trial_last_day',              _trial_end,
      'trial_already_used',          true,
      'facial_trial_used',           _facial_trial_used,
      'current_period_end',          _billing_shop.current_period_end,
      'grace_until',                 _billing_shop.grace_until,
      'subscription_notice',         NULL,
      'mp_subscription_id',          _billing_shop.mp_subscription_id,
      'stripe_subscription_id',      _shop.stripe_subscription_id,
      'plan_price_label',            'R$ 29,90/mês',
      'is_aggregated_account',       true,
      'is_admin_aggregated',         false,
      'aggregated_by_email',         _agg.owner_email,
      'can_manage_aggregated_accounts', false,
      'account_type',                'ca',
      'owner_slug',                  _billing_shop.slug,
      'owner_display_name',          _billing_shop.display_name,
      'owner_avatar_url',            _billing_shop.avatar_url,
      'owner_contact_phone',         COALESCE(_billing_shop.contact_phone, _billing_shop.whatsapp_number),
      'owner_public_booking_enabled', COALESCE(_billing_shop.allow_client_public_booking, true),
      'owner_can_view_appointments', _agg.owner_can_view_appointments,
      'owner_can_edit_appointments', _agg.owner_can_edit_appointments,
      'titular_has_editable_ca_appointments', false
    );
  END IF;

  RETURN json_build_object(
    'is_admin',                    false,
    'can_book',                    _can_book,
    'subscription_status',         _shop.subscription_status,
    'trial_started_at',            _shop.trial_started_at,
    'trial_days_left',             _trial_days_left,
    'trial_last_day',              _trial_end,
    'trial_already_used',          _trial_already_used,
    'facial_trial_used',           _facial_trial_used,
    'current_period_end',          _shop.current_period_end,
    'grace_until',                 _shop.grace_until,
    'subscription_notice',         _shop.subscription_notice,
    'mp_subscription_id',          _shop.mp_subscription_id,
    'stripe_subscription_id',      _shop.stripe_subscription_id,
    'plan_price_label',            'R$ 29,90/mês',
    'is_aggregated_account',       false,
    'is_admin_aggregated',         false,
    'can_manage_aggregated_accounts', true,
    'account_type',                'ct',
    'titular_has_editable_ca_appointments', _has_editable_ca
  );
END;
$$;
