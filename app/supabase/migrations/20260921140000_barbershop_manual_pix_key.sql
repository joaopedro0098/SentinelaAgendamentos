-- Chave Pix manual para cobrança fora do Mercado Pago (painel).

ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS manual_pix_key text;

COMMENT ON COLUMN public.barbershops.manual_pix_key IS
  'Chave Pix informada pelo profissional para cobrança manual (copiar e enviar ao paciente).';

CREATE OR REPLACE FUNCTION public.get_shop_manual_pix_key()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shop public.barbershops%ROWTYPE;
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

  RETURN json_build_object(
    'ok', true,
    'manual_pix_key', nullif(trim(_shop.manual_pix_key), '')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_shop_manual_pix_key(p_manual_pix_key text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shop public.barbershops%ROWTYPE;
  _normalized text;
  _is_ca boolean := false;
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

  IF _is_ca THEN
    IF EXISTS (
      SELECT 1
      FROM public.barbershops ts
      WHERE ts.id = public.titular_shop_id_for_shop(_shop.id)
        AND coalesce(ts.payments_centralized, true)
    ) THEN
      RETURN json_build_object('error', 'forbidden', 'message', 'Conta titular centralizou pagamentos.');
    END IF;
  END IF;

  _normalized := nullif(trim(p_manual_pix_key), '');

  IF _normalized IS NOT NULL AND length(_normalized) > 140 THEN
    RETURN json_build_object('error', 'invalid', 'message', 'Chave Pix muito longa.');
  END IF;

  UPDATE public.barbershops
  SET manual_pix_key = _normalized,
      updated_at = now()
  WHERE id = _shop.id;

  RETURN json_build_object('ok', true, 'manual_pix_key', _normalized);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shop_manual_pix_key() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_shop_manual_pix_key(text) TO authenticated;

-- Inclui manual_pix_key no payload do painel de pagamentos (função vigente).
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
    'can_enable_payment', _mp_connected,
    'manual_pix_key', nullif(trim(_shop.manual_pix_key), '')
  );
END;
$$;
