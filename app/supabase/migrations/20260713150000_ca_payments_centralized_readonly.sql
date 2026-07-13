-- CA: aba Pagamentos com titular Pro; centralizada = somente leitura; descentralizada = painel
-- completo (sem toggle "Centralizar pagamentos"). CT/AA mantêm o toggle.

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
          'Pagamentos no link público exigem plano Pro do titular. Solicite a assinatura Pro em Conta.'
      );
    END IF;

    _centralized := coalesce(_titular_shop.payments_centralized, true);

    IF _centralized THEN
      RETURN json_build_object(
        'role', 'ca',
        'ca_readonly', true,
        'payments_centralized', true,
        'readonly_message', 'Pagamentos centralizados pela conta titular.'
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

CREATE OR REPLACE FUNCTION public.update_payment_panel_settings(
  p_payments_centralized boolean DEFAULT NULL,
  p_appointment_payment_mode text DEFAULT NULL,
  p_appointment_deposit_type text DEFAULT NULL,
  p_appointment_deposit_value int DEFAULT NULL,
  p_payment_enable_card boolean DEFAULT NULL,
  p_payment_enable_pix boolean DEFAULT NULL,
  p_payment_pass_fee_card boolean DEFAULT NULL,
  p_payment_pass_fee_pix boolean DEFAULT NULL,
  p_payment_max_installments int DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shop public.barbershops%ROWTYPE;
  _titular_shop public.barbershops%ROWTYPE;
  _target_shop public.barbershops%ROWTYPE;
  _is_ca boolean := false;
  _centralized boolean := false;
  _mode public.appointment_payment_mode;
  _dep_type public.appointment_deposit_type;
  _max_inst smallint;
  _enable_card boolean;
  _enable_pix boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  SELECT s.* INTO _shop FROM public.barbershops s WHERE s.owner_id = auth.uid() LIMIT 1;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'no_shop');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.aggregated_accounts aa
    WHERE aa.aggregated_user_id = auth.uid()
      AND aa.status = 'active'::public.aggregated_account_status
  ) INTO _is_ca;

  IF _is_ca THEN
    SELECT ts.* INTO _titular_shop
    FROM public.barbershops ts
    WHERE ts.id = public.titular_shop_id_for_shop(_shop.id);

    IF NOT public.shop_can_use_appointment_payments(_titular_shop) THEN
      RETURN json_build_object(
        'error', 'ca_readonly',
        'message', 'Pagamentos no link público exigem plano Pro do titular.'
      );
    END IF;

    _centralized := coalesce(_titular_shop.payments_centralized, true);

    IF _centralized THEN
      RETURN json_build_object(
        'error', 'ca_readonly',
        'message', 'Pagamentos centralizados pela conta titular.'
      );
    END IF;
  END IF;

  _target_shop := _shop;

  IF p_payments_centralized IS NOT NULL AND NOT _is_ca THEN
    UPDATE public.barbershops SET payments_centralized = p_payments_centralized WHERE id = _shop.id;
    SELECT * INTO _shop FROM public.barbershops WHERE id = _shop.id;
    _target_shop := _shop;
  END IF;

  IF p_appointment_payment_mode IS NOT NULL THEN
    _mode := p_appointment_payment_mode::public.appointment_payment_mode;

    IF _mode <> 'none'::public.appointment_payment_mode THEN
      IF _target_shop.mp_connect_status <> 'connected'::public.mp_connect_status
        OR _target_shop.mp_access_token IS NULL THEN
        RETURN json_build_object(
          'error', 'mp_not_connected',
          'message', 'Conecte a conta Mercado Pago antes de exigir pagamento.'
        );
      END IF;
    END IF;

    IF _mode = 'deposit'::public.appointment_payment_mode THEN
      _dep_type := coalesce(
        p_appointment_deposit_type::public.appointment_deposit_type,
        _target_shop.appointment_deposit_type,
        'percent'::public.appointment_deposit_type
      );
      IF _dep_type = 'percent'::public.appointment_deposit_type THEN
        IF coalesce(p_appointment_deposit_value, _target_shop.appointment_deposit_value) IS NULL
          OR coalesce(p_appointment_deposit_value, _target_shop.appointment_deposit_value) < 1
          OR coalesce(p_appointment_deposit_value, _target_shop.appointment_deposit_value) > 100 THEN
          RETURN json_build_object('error', 'invalid_deposit_percent');
        END IF;
      ELSIF _dep_type = 'fixed'::public.appointment_deposit_type THEN
        IF coalesce(p_appointment_deposit_value, _target_shop.appointment_deposit_value) IS NULL
          OR coalesce(p_appointment_deposit_value, _target_shop.appointment_deposit_value) < 50 THEN
          RETURN json_build_object('error', 'invalid_deposit_fixed');
        END IF;
      END IF;
    END IF;
  END IF;

  IF p_payment_max_installments IS NOT NULL THEN
    _max_inst := CASE
      WHEN p_payment_max_installments < 1 THEN 1::smallint
      ELSE LEAST(GREATEST(p_payment_max_installments, 1), 12)::smallint
    END;
  END IF;

  _enable_card := coalesce(p_payment_enable_card, _target_shop.payment_enable_card, true);
  _enable_pix := coalesce(p_payment_enable_pix, _target_shop.payment_enable_pix, true);

  IF coalesce(_mode, _target_shop.appointment_payment_mode) <> 'none'::public.appointment_payment_mode THEN
    IF NOT _enable_card AND NOT _enable_pix THEN
      RETURN json_build_object(
        'error', 'no_payment_method',
        'message', 'Ative cartão ou Pix para cobrar no link público.'
      );
    END IF;
  END IF;

  UPDATE public.barbershops
  SET
    appointment_payment_mode = coalesce(_mode, appointment_payment_mode),
    appointment_deposit_type = CASE
      WHEN coalesce(_mode, appointment_payment_mode) = 'deposit'::public.appointment_payment_mode
        THEN coalesce(_dep_type, appointment_deposit_type, 'percent'::public.appointment_deposit_type)
      WHEN p_appointment_payment_mode IN ('none', 'full') THEN NULL
      ELSE appointment_deposit_type
    END,
    appointment_deposit_value = CASE
      WHEN coalesce(_mode, appointment_payment_mode) = 'deposit'::public.appointment_payment_mode
        THEN coalesce(p_appointment_deposit_value, appointment_deposit_value)
      WHEN p_appointment_payment_mode IN ('none', 'full') THEN NULL
      ELSE appointment_deposit_value
    END,
    payment_enable_card = _enable_card,
    payment_enable_pix = _enable_pix,
    payment_pass_fee_card = coalesce(p_payment_pass_fee_card, payment_pass_fee_card),
    payment_pass_fee_pix = coalesce(p_payment_pass_fee_pix, payment_pass_fee_pix),
    payment_max_installments = coalesce(_max_inst, payment_max_installments),
    updated_at = now()
  WHERE id = _target_shop.id;

  RETURN public.get_payment_panel_settings();
END;
$$;

COMMENT ON FUNCTION public.get_payment_panel_settings() IS
  'Painel Pagamentos: CA centralizada = readonly; CA descentralizada = painel completo sem toggle centralizar; CT/AA editam centralização.';
