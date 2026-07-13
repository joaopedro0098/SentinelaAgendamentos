-- Fix crítico: get_my_subscription() estava lançando erro em runtime para TODO
-- CT e TODA CA (não apenas CA), pois _shop/_billing_shop eram declarados como
-- "record" genérico e passados para shop_can_use_appointment_payments(barbershops),
-- que exige o tipo composto exato. Postgres não faz esse cast implícito
-- ("cannot cast type record to barbershops"), então a RPC falhava e o frontend
-- zerava subscriptionInfo — escondendo Relatórios, Suporte, aviso de conta
-- agregada e o card de planos para todos.

CREATE OR REPLACE FUNCTION public.get_my_subscription()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  _shop              public.barbershops%ROWTYPE;
  _billing_shop      public.barbershops%ROWTYPE;
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
  _tier              text;
  _can_use_payments  boolean;
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
      'subscription_tier',           'pro',
      'can_use_appointment_payments', true,
      'can_view_payments_tab',       true,
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
      'subscription_tier',           COALESCE(_shop.subscription_tier, 'pro'),
      'can_use_appointment_payments', true,
      'can_view_payments_tab',       true,
      'titular_has_editable_ca_appointments', _has_editable_ca
    );
  END IF;

  SELECT
    aa.owner_user_id,
    lower(trim(ou.email)) AS owner_email,
    aa.owner_can_view_appointments,
    aa.owner_can_edit_appointments,
    aa.owner_can_view_annotations
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

  _tier := _billing_shop.subscription_tier;
  _can_use_payments := public.shop_can_use_appointment_payments(_billing_shop);

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
      'last_payment_method',         _billing_shop.last_payment_method,
      'stripe_subscription_id',      _shop.stripe_subscription_id,
      'plan_price_label',            CASE _tier
                                       WHEN 'start' THEN 'R$ 39,90/mês'
                                       WHEN 'pro' THEN 'R$ 49,90/mês'
                                       ELSE 'R$ 29,90/mês'
                                     END,
      'subscription_tier',           _tier,
      'can_use_appointment_payments', _can_use_payments,
      'can_view_payments_tab',       true,
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
      'owner_can_view_annotations',  _agg.owner_can_view_annotations,
      'titular_has_editable_ca_appointments', false
    );
  END IF;

  _tier := _shop.subscription_tier;
  _can_use_payments := public.shop_can_use_appointment_payments(_shop);

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
    'last_payment_method',         _shop.last_payment_method,
    'stripe_subscription_id',      _shop.stripe_subscription_id,
    'plan_price_label',            CASE _tier
                                     WHEN 'start' THEN 'R$ 39,90/mês'
                                     WHEN 'pro' THEN 'R$ 49,90/mês'
                                     ELSE 'R$ 29,90/mês'
                                   END,
    'subscription_tier',           _tier,
    'can_use_appointment_payments', _can_use_payments,
    'can_view_payments_tab',       _can_use_payments,
    'is_aggregated_account',       false,
    'is_admin_aggregated',         false,
    'can_manage_aggregated_accounts', true,
    'account_type',                'ct',
    'titular_has_editable_ca_appointments', _has_editable_ca
  );
END;
$$;
