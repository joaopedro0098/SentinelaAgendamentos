-- Parcelamento de cartão: config por barbershop, cálculo centralizado, CT/CA.

ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS installment_pass_fee_to_client boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS installment_max_count smallint,
  ADD COLUMN IF NOT EXISTS installment_surcharge_rates jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.barbershops.installment_pass_fee_to_client IS
  'Se true, repassa acréscimo de parcelamento ao cliente no checkout.';
COMMENT ON COLUMN public.barbershops.installment_max_count IS
  'Máximo de parcelas oferecidas (2–12). NULL ou <2 = somente 1x.';
COMMENT ON COLUMN public.barbershops.installment_surcharge_rates IS
  'Mapa JSON {"2": 4.5, "3": 5.0, ...} percentual de acréscimo por faixa.';

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS installment_count smallint,
  ADD COLUMN IF NOT EXISTS valor_base_centavos int,
  ADD COLUMN IF NOT EXISTS installment_surcharge_centavos int,
  ADD COLUMN IF NOT EXISTS installment_fixed_fee_centavos int;

-- =============================================================================
-- Cálculo de parcelamento (fonte única)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.clamp_installment_surcharge_percent(p_value numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT GREATEST(coalesce(p_value, 0), 3.99);
$$;

CREATE OR REPLACE FUNCTION public.normalize_installment_surcharge_rates(
  p_rates jsonb,
  p_max_count int
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  _result jsonb := '{}'::jsonb;
  _i int;
  _raw numeric;
  _key text;
BEGIN
  IF p_max_count IS NULL OR p_max_count < 2 THEN
    RETURN '{}'::jsonb;
  END IF;

  IF p_max_count > 12 THEN
    RETURN NULL;
  END IF;

  FOR _i IN 2..p_max_count LOOP
    _key := _i::text;
    IF p_rates IS NULL OR NOT (p_rates ? _key) THEN
      RETURN NULL;
    END IF;
    _raw := (p_rates ->> _key)::numeric;
    IF _raw IS NULL THEN
      RETURN NULL;
    END IF;
    _result := _result || jsonb_build_object(_key, public.clamp_installment_surcharge_percent(_raw));
  END LOOP;

  RETURN _result;
END;
$$;

CREATE OR REPLACE FUNCTION public.installment_config_enabled(
  p_max_count smallint,
  p_rates jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_max_count IS NOT NULL
    AND p_max_count >= 2
    AND p_max_count <= 12
    AND p_rates IS NOT NULL
    AND p_rates <> '{}'::jsonb;
$$;

CREATE OR REPLACE FUNCTION public.calculate_installment_checkout_centavos(
  p_base_centavos int,
  p_installment_count int,
  p_pass_fee_to_client boolean,
  p_max_count smallint,
  p_surcharge_rates jsonb
)
RETURNS json
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  _count int := GREATEST(coalesce(p_installment_count, 1), 1);
  _base int := GREATEST(coalesce(p_base_centavos, 0), 0);
  _stripe_percent_part int;
  _base_percentual int;
  _prof_percent numeric;
  _surcharge int;
  _fixed_fee int := 0;
  _total int;
  _key text;
BEGIN
  IF _base < 50 THEN
    RETURN json_build_object('error', 'invalid_base_amount');
  END IF;

  IF _count <= 1 THEN
    RETURN json_build_object(
      'installment_count', 1,
      'valor_base_centavos', _base,
      'stripe_percent_centavos', 0,
      'installment_surcharge_centavos', 0,
      'installment_fixed_fee_centavos', 0,
      'total_centavos', _base
    );
  END IF;

  IF NOT public.installment_config_enabled(p_max_count, p_surcharge_rates) THEN
    RETURN json_build_object('error', 'installments_not_configured');
  END IF;

  IF _count > p_max_count THEN
    RETURN json_build_object('error', 'installment_count_exceeds_max');
  END IF;

  _key := _count::text;
  IF NOT (p_surcharge_rates ? _key) THEN
    RETURN json_build_object('error', 'installment_rate_missing');
  END IF;

  IF NOT coalesce(p_pass_fee_to_client, false) THEN
    RETURN json_build_object(
      'installment_count', _count,
      'valor_base_centavos', _base,
      'stripe_percent_centavos', 0,
      'installment_surcharge_centavos', 0,
      'installment_fixed_fee_centavos', 0,
      'total_centavos', _base
    );
  END IF;

  _stripe_percent_part := round(_base::numeric * 3.99 / 100.0)::int;
  _base_percentual := _base + _stripe_percent_part;
  _prof_percent := public.clamp_installment_surcharge_percent((p_surcharge_rates ->> _key)::numeric);
  _surcharge := round(_base_percentual::numeric * _prof_percent / 100.0)::int;
  _fixed_fee := 39;
  _total := _base_percentual + _surcharge + _fixed_fee;

  IF _total < 50 THEN
    _total := 50;
  END IF;

  RETURN json_build_object(
    'installment_count', _count,
    'valor_base_centavos', _base,
    'stripe_percent_centavos', _stripe_percent_part,
    'installment_surcharge_centavos', _surcharge,
    'installment_fixed_fee_centavos', _fixed_fee,
    'total_centavos', _total,
    'prof_surcharge_percent', _prof_percent
  );
END;
$$;

COMMENT ON FUNCTION public.calculate_installment_checkout_centavos(int, int, boolean, smallint, jsonb) IS
  'Total do checkout por parcelas. 1x = base. Toggle off = base. Toggle on = base + 3,99% + acréscimo faixa + R$0,39.';

GRANT EXECUTE ON FUNCTION public.calculate_installment_checkout_centavos(int, int, boolean, smallint, jsonb) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.calculate_installment_checkout_for_barbearia(
  p_barbearia_id uuid,
  p_base_centavos int,
  p_installment_count int
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _settings json;
  _config_shop_id uuid;
BEGIN
  _settings := public.get_effective_appointment_payment_settings(p_barbearia_id);
  IF (_settings->>'error') IS NOT NULL THEN
    RETURN _settings;
  END IF;

  _config_shop_id := (_settings->>'config_shop_id')::uuid;

  RETURN public.calculate_installment_checkout_centavos(
    p_base_centavos,
    p_installment_count,
    coalesce((_settings->'installment'->>'pass_fee_to_client')::boolean, false),
    (_settings->'installment'->>'max_count')::smallint,
    coalesce(_settings->'installment'->'surcharge_rates', '{}'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_installment_checkout_for_barbearia(uuid, int, int) TO anon, authenticated, service_role;

-- =============================================================================
-- Settings efetivos (checkout público)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_effective_appointment_payment_settings(p_barbearia_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _dest_shop_id uuid;
  _config_shop_id uuid;
  _shop record;
  _titular_shop_id uuid;
  _is_ca boolean := false;
  _installment json;
BEGIN
  _dest_shop_id := public.payment_destination_shop_id(p_barbearia_id);
  IF _dest_shop_id IS NULL THEN
    RETURN json_build_object('error', 'shop_not_found');
  END IF;

  _titular_shop_id := public.titular_shop_id_for_shop(
    public.shop_id_for_barbearia(p_barbearia_id)
  );

  _is_ca := _titular_shop_id IS DISTINCT FROM public.shop_id_for_barbearia(p_barbearia_id);

  IF _is_ca THEN
    SELECT payments_centralized INTO _shop
    FROM public.barbershops
    WHERE id = _titular_shop_id;

    IF coalesce(_shop.payments_centralized, true) THEN
      _config_shop_id := _titular_shop_id;
    ELSE
      _config_shop_id := public.shop_id_for_barbearia(p_barbearia_id);
    END IF;
  ELSE
    _config_shop_id := _dest_shop_id;
  END IF;

  SELECT
    s.id,
    s.stripe_connect_account_id,
    s.stripe_connect_status,
    s.stripe_connect_email,
    s.payments_centralized,
    s.appointment_payment_mode,
    s.appointment_deposit_type,
    s.appointment_deposit_value,
    s.installment_pass_fee_to_client,
    s.installment_max_count,
    s.installment_surcharge_rates
  INTO _shop
  FROM public.barbershops s
  WHERE s.id = _config_shop_id;

  _installment := json_build_object(
    'pass_fee_to_client', coalesce(_shop.installment_pass_fee_to_client, false),
    'max_count', _shop.installment_max_count,
    'surcharge_rates', coalesce(_shop.installment_surcharge_rates, '{}'::jsonb),
    'enabled', public.installment_config_enabled(_shop.installment_max_count, _shop.installment_surcharge_rates)
  );

  RETURN json_build_object(
    'config_shop_id', _config_shop_id,
    'destination_shop_id', _dest_shop_id,
    'is_ca', _is_ca,
    'payments_centralized', coalesce(_shop.payments_centralized, true),
    'payment_mode', _shop.appointment_payment_mode,
    'deposit_type', _shop.appointment_deposit_type,
    'deposit_value', _shop.appointment_deposit_value,
    'installment', _installment,
    'stripe_connect_account_id', (
      SELECT ds.stripe_connect_account_id
      FROM public.barbershops ds
      WHERE ds.id = _dest_shop_id
    ),
    'stripe_connect_status', (
      SELECT ds.stripe_connect_status::text
      FROM public.barbershops ds
      WHERE ds.id = _dest_shop_id
    ),
    'stripe_connect_email', (
      SELECT ds.stripe_connect_email
      FROM public.barbershops ds
      WHERE ds.id = _dest_shop_id
    ),
    'requires_payment',
      _shop.appointment_payment_mode <> 'none'::public.appointment_payment_mode
      AND (
        SELECT ds.stripe_connect_status
        FROM public.barbershops ds
        WHERE ds.id = _dest_shop_id
      ) = 'connected'::public.stripe_connect_status
  );
END;
$$;

-- =============================================================================
-- Painel: ler / salvar
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_payment_panel_settings()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shop record;
  _titular_shop record;
  _is_ca boolean := false;
  _is_ct boolean := false;
  _barbearia_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  SELECT s.*, b.id AS barbearia_id
  INTO _shop
  FROM public.barbershops s
  LEFT JOIN public.barbearias b ON b.slug = s.slug
  WHERE s.owner_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'shop_not_found');
  END IF;

  _barbearia_id := _shop.barbearia_id;

  SELECT EXISTS (
    SELECT 1
    FROM public.aggregated_accounts aa
    WHERE aa.aggregated_user_id = auth.uid()
      AND aa.status = 'active'::public.aggregated_account_status
  ) INTO _is_ca;

  _is_ct := NOT _is_ca AND EXISTS (
    SELECT 1
    FROM public.aggregated_accounts aa
    WHERE aa.owner_user_id = auth.uid()
      AND aa.status = 'active'::public.aggregated_account_status
  );

  IF _is_ca THEN
    SELECT s.*
    INTO _titular_shop
    FROM public.aggregated_accounts aa
    JOIN public.barbershops s ON s.owner_id = aa.owner_user_id
    WHERE aa.aggregated_user_id = auth.uid()
      AND aa.status = 'active'::public.aggregated_account_status
    LIMIT 1;

    IF coalesce(_titular_shop.payments_centralized, true) THEN
      RETURN json_build_object(
        'role', 'ca_readonly',
        'payments_centralized', true,
        'message', 'Pagamentos centralizados pelo titular. Entre em contato com o titular para alterações.'
      );
    END IF;
  END IF;

  RETURN json_build_object(
    'role', CASE WHEN _is_ca THEN 'ca' WHEN _is_ct THEN 'ct' ELSE 'owner' END,
    'shop_id', _shop.id,
    'barbearia_id', _barbearia_id,
    'payments_centralized', coalesce(_shop.payments_centralized, true),
    'can_edit_centralization', _is_ct OR (_is_ca = false AND NOT _is_ct),
    'stripe_connect_account_id', _shop.stripe_connect_account_id,
    'stripe_connect_status', _shop.stripe_connect_status::text,
    'stripe_connect_email', _shop.stripe_connect_email,
    'appointment_payment_mode', _shop.appointment_payment_mode::text,
    'appointment_deposit_type', _shop.appointment_deposit_type::text,
    'appointment_deposit_value', _shop.appointment_deposit_value,
    'installment_pass_fee_to_client', coalesce(_shop.installment_pass_fee_to_client, false),
    'installment_max_count', _shop.installment_max_count,
    'installment_surcharge_rates', coalesce(_shop.installment_surcharge_rates, '{}'::jsonb),
    'installment_enabled', public.installment_config_enabled(_shop.installment_max_count, _shop.installment_surcharge_rates),
    'all_services_have_prices', public.shop_has_all_active_service_prices(_shop.id),
    'can_enable_payment',
      _shop.stripe_connect_status = 'connected'::public.stripe_connect_status
      AND public.shop_has_all_active_service_prices(_shop.id)
  );
END;
$$;

DROP FUNCTION IF EXISTS public.update_payment_panel_settings(boolean, text, text, int);

CREATE OR REPLACE FUNCTION public.update_payment_panel_settings(
  p_payments_centralized boolean DEFAULT NULL,
  p_appointment_payment_mode text DEFAULT NULL,
  p_appointment_deposit_type text DEFAULT NULL,
  p_appointment_deposit_value int DEFAULT NULL,
  p_installment_pass_fee_to_client boolean DEFAULT NULL,
  p_installment_max_count int DEFAULT NULL,
  p_installment_surcharge_rates jsonb DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shop record;
  _is_ca boolean := false;
  _mode public.appointment_payment_mode;
  _dep_type public.appointment_deposit_type;
  _max_count smallint;
  _normalized_rates jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  SELECT s.*
  INTO _shop
  FROM public.barbershops s
  WHERE s.owner_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'shop_not_found');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.aggregated_accounts aa
    WHERE aa.aggregated_user_id = auth.uid()
      AND aa.status = 'active'::public.aggregated_account_status
  ) INTO _is_ca;

  IF _is_ca THEN
    SELECT coalesce(ts.payments_centralized, true)
    INTO _shop.payments_centralized
    FROM public.aggregated_accounts aa
    JOIN public.barbershops ts ON ts.owner_id = aa.owner_user_id
    WHERE aa.aggregated_user_id = auth.uid()
      AND aa.status = 'active'::public.aggregated_account_status
    LIMIT 1;

    IF coalesce(_shop.payments_centralized, true) THEN
      RETURN json_build_object('error', 'centralized_readonly');
    END IF;
  END IF;

  IF p_payments_centralized IS NOT NULL AND NOT _is_ca THEN
    UPDATE public.barbershops
    SET payments_centralized = p_payments_centralized,
        updated_at = now()
    WHERE id = _shop.id;
  END IF;

  IF p_appointment_payment_mode IS NOT NULL THEN
    _mode := p_appointment_payment_mode::public.appointment_payment_mode;

    IF _mode <> 'none'::public.appointment_payment_mode THEN
      IF _shop.stripe_connect_status <> 'connected'::public.stripe_connect_status THEN
        RETURN json_build_object('error', 'stripe_not_connected');
      END IF;
      IF NOT public.shop_has_all_active_service_prices(_shop.id) THEN
        RETURN json_build_object(
          'error', 'missing_service_prices',
          'message', 'Cadastre o preço de todos os serviços ativos antes de exigir pagamento.'
        );
      END IF;
    END IF;

    IF _mode = 'deposit'::public.appointment_payment_mode THEN
      IF p_appointment_deposit_type IS NULL OR p_appointment_deposit_value IS NULL THEN
        RETURN json_build_object('error', 'deposit_config_required');
      END IF;
      _dep_type := p_appointment_deposit_type::public.appointment_deposit_type;
    END IF;

    UPDATE public.barbershops
    SET
      appointment_payment_mode = _mode,
      appointment_deposit_type = CASE
        WHEN _mode = 'deposit'::public.appointment_payment_mode THEN _dep_type
        ELSE NULL
      END,
      appointment_deposit_value = CASE
        WHEN _mode = 'deposit'::public.appointment_payment_mode THEN p_appointment_deposit_value
        ELSE NULL
      END,
      updated_at = now()
    WHERE id = _shop.id;
  END IF;

  IF
    p_installment_pass_fee_to_client IS NOT NULL
    OR p_installment_max_count IS NOT NULL
    OR p_installment_surcharge_rates IS NOT NULL
  THEN
    _max_count := _shop.installment_max_count;

    IF p_installment_max_count IS NOT NULL THEN
      _max_count := CASE
        WHEN p_installment_max_count < 2 THEN NULL
        ELSE LEAST(GREATEST(p_installment_max_count, 2), 12)::smallint
      END;
    END IF;

    IF _max_count IS NOT NULL THEN
      _normalized_rates := public.normalize_installment_surcharge_rates(
        coalesce(
          p_installment_surcharge_rates,
          _shop.installment_surcharge_rates,
          '{}'::jsonb
        ),
        _max_count::int
      );
      IF _normalized_rates IS NULL THEN
        RETURN json_build_object(
          'error', 'installment_rates_incomplete',
          'message', 'Preencha o percentual de acréscimo para todas as parcelas até o máximo definido.'
        );
      END IF;
    ELSE
      _normalized_rates := '{}'::jsonb;
    END IF;

    UPDATE public.barbershops
    SET
      installment_pass_fee_to_client = coalesce(
        p_installment_pass_fee_to_client,
        installment_pass_fee_to_client
      ),
      installment_max_count = CASE
        WHEN p_installment_max_count IS NOT NULL THEN _max_count
        ELSE installment_max_count
      END,
      installment_surcharge_rates = CASE
        WHEN p_installment_max_count IS NOT NULL AND _max_count IS NULL THEN '{}'::jsonb
        WHEN p_installment_surcharge_rates IS NOT NULL OR p_installment_max_count IS NOT NULL THEN _normalized_rates
        ELSE installment_surcharge_rates
      END,
      updated_at = now()
    WHERE id = _shop.id;
  END IF;

  RETURN public.get_payment_panel_settings();
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_payment_panel_settings(boolean, text, text, int, boolean, int, jsonb) TO authenticated;

-- =============================================================================
-- Hold público
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_public_booking_payment_hold(
  p_barbearia_id uuid,
  p_barbeiro_id uuid,
  p_data date,
  p_hora time,
  p_cliente_nome text,
  p_cliente_whatsapp text,
  p_cliente_id uuid,
  p_duracao_minutos int,
  p_servicos_nomes text[],
  p_observacao text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _settings json;
  _settings_row record;
  _calc json;
  _charge int;
  _total int;
  _remaining int;
  _expires timestamptz;
  _ag_id uuid;
  _token uuid;
  _hold_minutes int := coalesce(
    nullif(trim(current_setting('app.appointment_payment_hold_minutes', true)), '')::int,
    15
  );
BEGIN
  _settings := public.get_effective_appointment_payment_settings(p_barbearia_id);
  IF (_settings->>'error') IS NOT NULL THEN
    RETURN _settings;
  END IF;

  IF coalesce((_settings->>'requires_payment')::boolean, false) IS NOT TRUE THEN
    RETURN json_build_object('error', 'payment_not_required');
  END IF;

  SELECT
    (_settings->>'payment_mode')::public.appointment_payment_mode AS payment_mode,
    (_settings->>'deposit_type')::public.appointment_deposit_type AS deposit_type,
    (_settings->>'deposit_value')::int AS deposit_value,
    _settings->>'stripe_connect_account_id' AS stripe_account_id,
    _settings->'installment' AS installment
  INTO _settings_row;

  _calc := public.calculate_appointment_payment_centavos(
    p_barbeiro_id,
    p_servicos_nomes,
    _settings_row.payment_mode,
    _settings_row.deposit_type,
    _settings_row.deposit_value
  );

  IF (_calc->>'error') IS NOT NULL THEN
    RETURN _calc;
  END IF;

  _total := (_calc->>'total_centavos')::int;
  _charge := (_calc->>'charge_centavos')::int;
  _remaining := (_calc->>'remaining_centavos')::int;
  _expires := now() + make_interval(mins => _hold_minutes);

  IF EXISTS (
    SELECT 1
    FROM public.agendamentos a
    WHERE a.barbeiro_id = p_barbeiro_id
      AND a.data = p_data
      AND a.hora = p_hora
      AND a.status IN (
        'confirmado'::public.agendamento_status,
        'aguardando_pagamento'::public.agendamento_status
      )
  ) THEN
    RETURN json_build_object('error', 'slot_taken');
  END IF;

  INSERT INTO public.agendamentos (
    barbearia_id,
    barbeiro_id,
    data,
    hora,
    cliente_nome,
    cliente_whatsapp,
    cliente_id,
    duracao_minutos,
    servicos_nomes,
    status,
    observacao,
    origem,
    requires_client_confirmation,
    payment_status,
    valor_pago_centavos,
    valor_base_centavos,
    valor_restante_centavos,
    payment_expires_at,
    installment_count
  )
  VALUES (
    p_barbearia_id,
    p_barbeiro_id,
    p_data,
    p_hora,
    trim(p_cliente_nome),
    p_cliente_whatsapp,
    p_cliente_id,
    p_duracao_minutos,
    p_servicos_nomes,
    'aguardando_pagamento'::public.agendamento_status,
    p_observacao,
    'link_publico',
    true,
    'pending'::public.appointment_payment_status,
    _charge,
    _charge,
    _remaining,
    _expires,
    1
  )
  RETURNING id, confirmation_token INTO _ag_id, _token;

  RETURN json_build_object(
    'ok', true,
    'agendamento_id', _ag_id,
    'confirmation_token', _token,
    'charge_centavos', _charge,
    'valor_base_centavos', _charge,
    'total_centavos', _total,
    'remaining_centavos', _remaining,
    'payment_expires_at', _expires,
    'stripe_connect_account_id', _settings_row.stripe_account_id,
    'installment', _settings_row.installment
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_agendamento_installment_checkout(
  p_agendamento_id uuid,
  p_confirmation_token uuid,
  p_installment_count int
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row record;
  _calc json;
  _settings json;
  _base int;
BEGIN
  SELECT *
  INTO _row
  FROM public.agendamentos a
  WHERE a.id = p_agendamento_id
    AND a.confirmation_token = p_confirmation_token
    AND a.status = 'aguardando_pagamento'::public.agendamento_status
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  IF _row.payment_expires_at IS NOT NULL AND _row.payment_expires_at < now() THEN
    RETURN json_build_object('error', 'expired');
  END IF;

  _base := coalesce(_row.valor_base_centavos, _row.valor_pago_centavos);
  _settings := public.get_effective_appointment_payment_settings(_row.barbearia_id);

  IF (_settings->>'error') IS NOT NULL THEN
    RETURN _settings;
  END IF;

  _calc := public.calculate_installment_checkout_centavos(
    _base,
    p_installment_count,
    coalesce((_settings->'installment'->>'pass_fee_to_client')::boolean, false),
    (_settings->'installment'->>'max_count')::smallint,
    coalesce(_settings->'installment'->'surcharge_rates', '{}'::jsonb)
  );

  IF (_calc->>'error') IS NOT NULL THEN
    RETURN _calc;
  END IF;

  UPDATE public.agendamentos
  SET
    valor_pago_centavos = (_calc->>'total_centavos')::int,
    installment_count = (_calc->>'installment_count')::smallint,
    installment_surcharge_centavos = (_calc->>'installment_surcharge_centavos')::int,
    installment_fixed_fee_centavos = (_calc->>'installment_fixed_fee_centavos')::int
  WHERE id = p_agendamento_id;

  RETURN (
    _calc::jsonb
    || jsonb_build_object('ok', true, 'agendamento_id', p_agendamento_id)
  )::json;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_agendamento_installment_checkout(uuid, uuid, int) TO anon, authenticated, service_role;
