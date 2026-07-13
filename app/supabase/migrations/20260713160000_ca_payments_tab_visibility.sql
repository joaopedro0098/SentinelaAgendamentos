-- CA sempre enxerga a aba Pagamentos (conteúdo varia conforme plano/toggle do titular).

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
  _can_use_payments := _tier = 'pro'
    AND _billing_shop.subscription_status IN ('active', 'grace', 'cancelled')
    AND (
      _billing_shop.current_period_end IS NULL
      OR _billing_shop.current_period_end >= CURRENT_DATE
    );

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
  _can_use_payments := _tier = 'pro'
    AND _shop.subscription_status IN ('active', 'grace', 'cancelled')
    AND (
      _shop.current_period_end IS NULL
      OR _shop.current_period_end >= CURRENT_DATE
    );

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

-- Mensagens da CA na aba Pagamentos
CREATE OR REPLACE FUNCTION public.get_payment_panel_settings()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shop public.barbershops%ROWTYPE;
  _titular_shop public.barbershops%ROWTYPE;
  _config_shop public.barbershops%ROWTYPE;
  _mp_shop public.barbershops%ROWTYPE;
  _is_ca boolean := false;
  _is_ct boolean := false;
  _centralized boolean := false;
  _mp_connected boolean := false;
  _mp_managed_by_titular boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  SELECT s.* INTO _shop
  FROM public.barbershops s
  WHERE s.owner_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'no_shop');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.aggregated_accounts aa
    WHERE aa.aggregated_user_id = auth.uid()
      AND aa.status = 'active'::public.aggregated_account_status
  ) INTO _is_ca;

  _is_ct := NOT _is_ca AND EXISTS (
    SELECT 1 FROM public.aggregated_accounts aa
    WHERE aa.owner_user_id = auth.uid()
      AND aa.status = 'active'::public.aggregated_account_status
  );

  _config_shop := _shop;
  _mp_shop := _shop;

  IF _is_ca THEN
    SELECT ts.* INTO _titular_shop
    FROM public.barbershops ts
    WHERE ts.id = public.titular_shop_id_for_shop(_shop.id);

    IF NOT public.shop_can_use_appointment_payments(_titular_shop) THEN
      RETURN json_build_object(
        'role', 'ca',
        'ca_readonly', true,
        'payments_centralized', coalesce(_titular_shop.payments_centralized, true),
        'readonly_message',
          'O titular possui plano Start. Para receber pagamentos, o titular precisa assinar o Pro.'
      );
    END IF;

    _centralized := coalesce(_titular_shop.payments_centralized, true);

    IF _centralized THEN
      RETURN json_build_object(
        'role', 'ca',
        'ca_readonly', true,
        'payments_centralized', true,
        'readonly_message', 'Conta titular centralizou pagamentos.'
      );
    END IF;
  END IF;

  _mp_connected := _mp_shop.mp_connect_status = 'connected'::public.mp_connect_status
    AND _mp_shop.mp_access_token IS NOT NULL;

  RETURN json_build_object(
    'role', CASE WHEN _is_ca THEN 'ca' WHEN _is_ct THEN 'ct' ELSE 'owner' END,
    'ca_readonly', false,
    'shop_id', _shop.id,
    'payments_centralized', CASE WHEN _is_ca THEN _centralized ELSE coalesce(_shop.payments_centralized, true) END,
    'can_edit_centralization', _is_ct OR (NOT _is_ca AND NOT _is_ct),
    'mp_managed_by_titular', _mp_managed_by_titular,
    'can_connect_mp', NOT _mp_managed_by_titular,
    'mp_connect_status', _mp_shop.mp_connect_status::text,
    'mp_user_id', _mp_shop.mp_user_id,
    'mp_live_mode', _mp_shop.mp_live_mode,
    'mp_connected', _mp_connected,
    'appointment_payment_mode', _config_shop.appointment_payment_mode::text,
    'appointment_deposit_type', _config_shop.appointment_deposit_type::text,
    'appointment_deposit_value', _config_shop.appointment_deposit_value,
    'payment_enable_card', _config_shop.payment_enable_card,
    'payment_enable_pix', _config_shop.payment_enable_pix,
    'payment_pass_fee_card', _config_shop.payment_pass_fee_card,
    'payment_pass_fee_pix', _config_shop.payment_pass_fee_pix,
    'payment_max_installments', _config_shop.payment_max_installments,
    'has_priced_services', public.shop_has_priced_active_services(_shop.id),
    'can_enable_payment', _mp_connected
  );
END;
$$;
