-- Fase 2: regras de cobrança MP, cálculo valor/sinal, hold 15 min, expiração.

-- =============================================================================
-- Cálculo (serviços sem preço entram de graça; soma só com preço > 0)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.calculate_appointment_payment_centavos(
  p_barbeiro_id uuid,
  p_servicos_nomes text[],
  p_mode public.appointment_payment_mode,
  p_deposit_type public.appointment_deposit_type,
  p_deposit_value int
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total int := 0;
  _charge int := 0;
  _sn text;
  _price int;
  _found boolean;
BEGIN
  IF p_mode = 'none'::public.appointment_payment_mode THEN
    RETURN json_build_object('error', 'payment_not_required');
  END IF;

  IF p_servicos_nomes IS NULL OR array_length(p_servicos_nomes, 1) IS NULL THEN
    RETURN json_build_object('error', 'no_services');
  END IF;

  FOREACH _sn IN ARRAY p_servicos_nomes LOOP
    SELECT bs.preco_centavos INTO _price
    FROM public.barbeiro_services bs
    WHERE bs.barbeiro_id = p_barbeiro_id
      AND bs.nome = _sn
      AND bs.ativo = true
    LIMIT 1;

    _found := FOUND;
    IF NOT _found THEN
      RETURN json_build_object('error', 'service_not_found', 'service', _sn);
    END IF;

    IF coalesce(_price, 0) > 0 THEN
      _total := _total + _price;
    END IF;
  END LOOP;

  IF _total <= 0 THEN
    RETURN json_build_object(
      'payment_not_required', true,
      'total_centavos', 0,
      'charge_centavos', 0,
      'remaining_centavos', 0
    );
  END IF;

  IF p_mode = 'full'::public.appointment_payment_mode THEN
    _charge := _total;
  ELSIF p_mode = 'deposit'::public.appointment_payment_mode THEN
    IF p_deposit_type = 'percent'::public.appointment_deposit_type THEN
      IF p_deposit_value IS NULL OR p_deposit_value < 1 OR p_deposit_value > 100 THEN
        RETURN json_build_object('error', 'invalid_deposit_percent');
      END IF;
      _charge := round(_total::numeric * p_deposit_value / 100.0)::int;
    ELSIF p_deposit_type = 'fixed'::public.appointment_deposit_type THEN
      IF p_deposit_value IS NULL OR p_deposit_value < 50 THEN
        RETURN json_build_object('error', 'invalid_deposit_fixed');
      END IF;
      _charge := least(p_deposit_value, _total);
    ELSE
      RETURN json_build_object('error', 'invalid_deposit_type');
    END IF;
  ELSE
    RETURN json_build_object('error', 'payment_not_required');
  END IF;

  IF _charge < 50 THEN
    _charge := least(50, _total);
  END IF;

  RETURN json_build_object(
    'total_centavos', _total,
    'charge_centavos', _charge,
    'remaining_centavos', greatest(_total - _charge, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.shop_has_priced_active_services(p_shop_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.barbershops s
    JOIN public.barbearias b ON b.slug = s.slug
    JOIN public.barbeiros br ON br.barbearia_id = b.id AND br.ativo = true
    JOIN public.barbeiro_services bs ON bs.barbeiro_id = br.id AND bs.ativo = true
    WHERE s.id = p_shop_id
      AND coalesce(bs.preco_centavos, 0) > 0
  );
$$;

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
  _config public.barbershops%ROWTYPE;
  _dest public.barbershops%ROWTYPE;
  _titular_shop_id uuid;
  _barbearia_shop_id uuid;
  _is_ca boolean := false;
BEGIN
  _dest_shop_id := public.payment_destination_shop_id(p_barbearia_id);
  IF _dest_shop_id IS NULL THEN
    RETURN json_build_object('error', 'shop_not_found');
  END IF;

  _barbearia_shop_id := public.shop_id_for_barbearia(p_barbearia_id);
  _titular_shop_id := public.titular_shop_id_for_shop(_barbearia_shop_id);
  _is_ca := _titular_shop_id IS DISTINCT FROM _barbearia_shop_id;

  IF _is_ca THEN
    IF coalesce(
      (SELECT payments_centralized FROM public.barbershops WHERE id = _titular_shop_id),
      true
    ) THEN
      _config_shop_id := _titular_shop_id;
    ELSE
      _config_shop_id := _barbearia_shop_id;
    END IF;
  ELSE
    _config_shop_id := _dest_shop_id;
  END IF;

  SELECT * INTO _config FROM public.barbershops WHERE id = _config_shop_id;
  SELECT * INTO _dest FROM public.barbershops WHERE id = _dest_shop_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'shop_not_found');
  END IF;

  RETURN json_build_object(
    'config_shop_id', _config_shop_id,
    'destination_shop_id', _dest_shop_id,
    'is_ca', _is_ca,
    'payments_centralized', coalesce(_config.payments_centralized, true),
    'payment_mode', _config.appointment_payment_mode::text,
    'deposit_type', _config.appointment_deposit_type::text,
    'deposit_value', _config.appointment_deposit_value,
    'payment_enable_card', coalesce(_config.payment_enable_card, true),
    'payment_enable_pix', coalesce(_config.payment_enable_pix, true),
    'payment_pass_fee_card', coalesce(_config.payment_pass_fee_card, false),
    'payment_pass_fee_pix', coalesce(_config.payment_pass_fee_pix, false),
    'payment_max_installments', coalesce(_config.payment_max_installments, 1),
    'mp_connect_status', _dest.mp_connect_status::text,
    'mp_connected',
      _dest.mp_connect_status = 'connected'::public.mp_connect_status
      AND _dest.mp_access_token IS NOT NULL,
    'mp_live_mode', _dest.mp_live_mode,
    'requires_payment',
      _config.appointment_payment_mode <> 'none'::public.appointment_payment_mode
      AND _dest.mp_connect_status = 'connected'::public.mp_connect_status
      AND _dest.mp_access_token IS NOT NULL
      AND (coalesce(_config.payment_enable_card, true) OR coalesce(_config.payment_enable_pix, true))
  );
END;
$$;

-- =============================================================================
-- Painel: enriquecer leitura / validação na gravação
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_payment_panel_settings()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shop public.barbershops%ROWTYPE;
  _titular_shop public.barbershops%ROWTYPE;
  _is_ca boolean := false;
  _is_ct boolean := false;
  _ca_readonly boolean := false;
  _mp_connected boolean := false;
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

  IF _is_ca THEN
    SELECT ts.* INTO _titular_shop
    FROM public.barbershops ts
    WHERE ts.id = public.titular_shop_id_for_shop(_shop.id);

    IF coalesce(_titular_shop.payments_centralized, true) THEN
      _ca_readonly := true;
      RETURN json_build_object(
        'role', 'ca',
        'ca_readonly', true,
        'payments_centralized', true,
        'readonly_message',
          'Titular centralizou os pagamentos. Para receber na sua conta MP, solicite que habilitem a função ou desagregue sua conta.'
      );
    END IF;
  END IF;

  _mp_connected := _shop.mp_connect_status = 'connected'::public.mp_connect_status
    AND _shop.mp_access_token IS NOT NULL;

  RETURN json_build_object(
    'role', CASE WHEN _is_ca THEN 'ca' WHEN _is_ct THEN 'ct' ELSE 'owner' END,
    'ca_readonly', false,
    'shop_id', _shop.id,
    'payments_centralized', coalesce(_shop.payments_centralized, true),
    'can_edit_centralization', _is_ct OR (NOT _is_ca AND NOT _is_ct),
    'mp_connect_status', _shop.mp_connect_status::text,
    'mp_user_id', _shop.mp_user_id,
    'mp_live_mode', _shop.mp_live_mode,
    'mp_connected', _mp_connected,
    'appointment_payment_mode', _shop.appointment_payment_mode::text,
    'appointment_deposit_type', _shop.appointment_deposit_type::text,
    'appointment_deposit_value', _shop.appointment_deposit_value,
    'payment_enable_card', _shop.payment_enable_card,
    'payment_enable_pix', _shop.payment_enable_pix,
    'payment_pass_fee_card', _shop.payment_pass_fee_card,
    'payment_pass_fee_pix', _shop.payment_pass_fee_pix,
    'payment_max_installments', _shop.payment_max_installments,
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
  _is_ca boolean := false;
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

    IF coalesce(_titular_shop.payments_centralized, true) THEN
      RETURN json_build_object(
        'error', 'ca_readonly',
        'message', 'Titular centralizou os pagamentos.'
      );
    END IF;
  END IF;

  IF p_payments_centralized IS NOT NULL AND NOT _is_ca THEN
    UPDATE public.barbershops SET payments_centralized = p_payments_centralized WHERE id = _shop.id;
    SELECT * INTO _shop FROM public.barbershops WHERE id = _shop.id;
  END IF;

  IF p_appointment_payment_mode IS NOT NULL THEN
    _mode := p_appointment_payment_mode::public.appointment_payment_mode;

    IF _mode <> 'none'::public.appointment_payment_mode THEN
      IF _shop.mp_connect_status <> 'connected'::public.mp_connect_status
        OR _shop.mp_access_token IS NULL THEN
        RETURN json_build_object(
          'error', 'mp_not_connected',
          'message', 'Conecte sua conta Mercado Pago antes de exigir pagamento.'
        );
      END IF;
    END IF;

    IF _mode = 'deposit'::public.appointment_payment_mode THEN
      _dep_type := coalesce(
        p_appointment_deposit_type::public.appointment_deposit_type,
        _shop.appointment_deposit_type,
        'percent'::public.appointment_deposit_type
      );
      IF _dep_type = 'percent'::public.appointment_deposit_type THEN
        IF coalesce(p_appointment_deposit_value, _shop.appointment_deposit_value) IS NULL
          OR coalesce(p_appointment_deposit_value, _shop.appointment_deposit_value) < 1
          OR coalesce(p_appointment_deposit_value, _shop.appointment_deposit_value) > 100 THEN
          RETURN json_build_object('error', 'invalid_deposit_percent');
        END IF;
      ELSIF _dep_type = 'fixed'::public.appointment_deposit_type THEN
        IF coalesce(p_appointment_deposit_value, _shop.appointment_deposit_value) IS NULL
          OR coalesce(p_appointment_deposit_value, _shop.appointment_deposit_value) < 50 THEN
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

  _enable_card := coalesce(p_payment_enable_card, _shop.payment_enable_card, true);
  _enable_pix := coalesce(p_payment_enable_pix, _shop.payment_enable_pix, true);

  IF coalesce(_mode, _shop.appointment_payment_mode) <> 'none'::public.appointment_payment_mode THEN
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
    payment_enable_card = coalesce(p_payment_enable_card, payment_enable_card),
    payment_enable_pix = coalesce(p_payment_enable_pix, payment_enable_pix),
    payment_pass_fee_card = coalesce(p_payment_pass_fee_card, payment_pass_fee_card),
    payment_pass_fee_pix = coalesce(p_payment_pass_fee_pix, payment_pass_fee_pix),
    payment_max_installments = coalesce(_max_inst, payment_max_installments),
    updated_at = now()
  WHERE id = _shop.id;

  RETURN public.get_payment_panel_settings();
END;
$$;

-- =============================================================================
-- Hold 15 min (link público — checkout MP na Fase 3)
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
  _payment_mode public.appointment_payment_mode;
  _deposit_type public.appointment_deposit_type;
  _deposit_value int;
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
  PERFORM public.expirar_agendamentos_aguardando_pagamento();

  _settings := public.get_effective_appointment_payment_settings(p_barbearia_id);
  IF (_settings->>'error') IS NOT NULL THEN
    RETURN _settings;
  END IF;

  IF coalesce((_settings->>'requires_payment')::boolean, false) IS NOT TRUE THEN
    RETURN json_build_object('error', 'payment_not_required');
  END IF;

  _payment_mode := (_settings->>'payment_mode')::public.appointment_payment_mode;
  _deposit_type := (_settings->>'deposit_type')::public.appointment_deposit_type;
  _deposit_value := (_settings->>'deposit_value')::int;

  _calc := public.calculate_appointment_payment_centavos(
    p_barbeiro_id,
    p_servicos_nomes,
    _payment_mode,
    _deposit_type,
    _deposit_value
  );

  IF (_calc->>'error') IS NOT NULL THEN
    IF (_calc->>'error') = 'payment_not_required'
      OR coalesce((_calc->>'payment_not_required')::boolean, false) THEN
      RETURN json_build_object('error', 'payment_not_required');
    END IF;
    RETURN _calc;
  END IF;

  _total := (_calc->>'total_centavos')::int;
  _charge := (_calc->>'charge_centavos')::int;
  _remaining := (_calc->>'remaining_centavos')::int;

  IF _charge <= 0 THEN
    RETURN json_build_object('error', 'payment_not_required');
  END IF;

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
    valor_base_centavos,
    valor_pago_centavos,
    valor_restante_centavos,
    payment_expires_at
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
    _total,
    _charge,
    _remaining,
    _expires
  )
  RETURNING id, confirmation_token INTO _ag_id, _token;

  RETURN json_build_object(
    'ok', true,
    'agendamento_id', _ag_id,
    'confirmation_token', _token,
    'charge_centavos', _charge,
    'total_centavos', _total,
    'remaining_centavos', _remaining,
    'payment_expires_at', _expires,
    'destination_shop_id', _settings->>'destination_shop_id',
    'payment_enable_card', (_settings->>'payment_enable_card')::boolean,
    'payment_enable_pix', (_settings->>'payment_enable_pix')::boolean,
    'payment_pass_fee_card', (_settings->>'payment_pass_fee_card')::boolean,
    'payment_pass_fee_pix', (_settings->>'payment_pass_fee_pix')::boolean,
    'payment_max_installments', (_settings->>'payment_max_installments')::int
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_public_booking_payment_hold(
  p_agendamento_id uuid,
  p_confirmation_token uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.agendamentos
  SET
    status = 'cancelado'::public.agendamento_status,
    payment_status = 'cancelled'::public.appointment_payment_status,
    payment_expires_at = NULL
  WHERE id = p_agendamento_id
    AND confirmation_token = p_confirmation_token
    AND status = 'aguardando_pagamento'::public.agendamento_status;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_appointment_payment(
  p_agendamento_id uuid,
  p_mp_payment_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.agendamentos%ROWTYPE;
BEGIN
  SELECT * INTO _row
  FROM public.agendamentos a
  WHERE a.id = p_agendamento_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  IF _row.status = 'confirmado'::public.agendamento_status
     AND _row.payment_status = 'paid'::public.appointment_payment_status THEN
    RETURN json_build_object('ok', true, 'already_confirmed', true);
  END IF;

  IF _row.status <> 'aguardando_pagamento'::public.agendamento_status THEN
    RETURN json_build_object('error', 'invalid_status');
  END IF;

  IF _row.payment_expires_at IS NOT NULL AND _row.payment_expires_at < now() THEN
    UPDATE public.agendamentos
    SET
      status = 'cancelado'::public.agendamento_status,
      payment_status = 'cancelled'::public.appointment_payment_status,
      cancelado_por = 'sistema'
    WHERE id = p_agendamento_id;
    RETURN json_build_object('error', 'expired');
  END IF;

  UPDATE public.agendamentos
  SET
    status = 'confirmado'::public.agendamento_status,
    payment_status = 'paid'::public.appointment_payment_status,
    mp_payment_id = p_mp_payment_id,
    payment_expires_at = NULL
  WHERE id = p_agendamento_id;

  RETURN json_build_object('ok', true, 'agendamento_id', p_agendamento_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_appointment_payment(
  p_agendamento_id uuid,
  p_mp_payment_id text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.agendamentos
  SET
    status = 'cancelado'::public.agendamento_status,
    payment_status = 'failed'::public.appointment_payment_status,
    mp_payment_id = coalesce(p_mp_payment_id, mp_payment_id),
    payment_expires_at = NULL,
    cancelado_por = 'sistema'
  WHERE id = p_agendamento_id
    AND status = 'aguardando_pagamento'::public.agendamento_status;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.expirar_agendamentos_aguardando_pagamento()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count int;
BEGIN
  UPDATE public.agendamentos a
  SET
    status = 'cancelado'::public.agendamento_status,
    payment_status = 'cancelled'::public.appointment_payment_status,
    payment_expires_at = NULL,
    cancelado_por = 'sistema'
  WHERE a.status = 'aguardando_pagamento'::public.agendamento_status
    AND a.payment_expires_at IS NOT NULL
    AND a.payment_expires_at < now();

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

COMMENT ON FUNCTION public.expirar_agendamentos_aguardando_pagamento() IS
  'Cancela agendamentos aguardando_pagamento após payment_expires_at (15 min).';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'expirar-aguardando-pagamento';

    PERFORM cron.schedule(
      'expirar-aguardando-pagamento',
      '*/2 * * * *',
      $cron$SELECT public.expirar_agendamentos_aguardando_pagamento();$cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron indisponível; agende expirar_agendamentos_aguardando_pagamento externamente.';
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.calculate_appointment_payment_centavos(uuid, text[], public.appointment_payment_mode, public.appointment_deposit_type, int) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.shop_has_priced_active_services(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_effective_appointment_payment_settings(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_public_booking_payment_hold(uuid, uuid, date, time, text, text, uuid, int, text[], text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_public_booking_payment_hold(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_appointment_payment(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_appointment_payment(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.expirar_agendamentos_aguardando_pagamento() TO service_role;
