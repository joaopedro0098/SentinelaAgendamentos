-- Pagamento obrigatório no link público: Connect, config por barbershop, hold 15 min.
-- (enum aguardando_pagamento em 20260626359000_appointment_payments_enum.sql)

DO $$ BEGIN
  CREATE TYPE public.appointment_payment_mode AS ENUM ('none', 'deposit', 'full');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.appointment_deposit_type AS ENUM ('percent', 'fixed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.stripe_connect_status AS ENUM ('not_connected', 'pending', 'connected', 'restricted');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.appointment_payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_connect_status public.stripe_connect_status NOT NULL DEFAULT 'not_connected',
  ADD COLUMN IF NOT EXISTS stripe_connect_email text,
  ADD COLUMN IF NOT EXISTS payments_centralized boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS appointment_payment_mode public.appointment_payment_mode NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS appointment_deposit_type public.appointment_deposit_type,
  ADD COLUMN IF NOT EXISTS appointment_deposit_value int;

COMMENT ON COLUMN public.barbershops.payments_centralized IS
  'CT: se true, CAs usam conta e regras do titular. Ignorado em shops de CA.';

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS payment_intent_id text,
  ADD COLUMN IF NOT EXISTS payment_status public.appointment_payment_status,
  ADD COLUMN IF NOT EXISTS valor_pago_centavos int,
  ADD COLUMN IF NOT EXISTS valor_restante_centavos int,
  ADD COLUMN IF NOT EXISTS payment_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_agendamentos_payment_intent
  ON public.agendamentos (payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agendamentos_aguardando_pagamento_expires
  ON public.agendamentos (payment_expires_at)
  WHERE status = 'aguardando_pagamento'::public.agendamento_status;

DROP INDEX IF EXISTS public.agendamentos_barbeiro_data_hora_confirmado_key;

CREATE UNIQUE INDEX IF NOT EXISTS agendamentos_barbeiro_data_hora_ocupado_key
  ON public.agendamentos (barbeiro_id, data, hora)
  WHERE status IN (
    'confirmado'::public.agendamento_status,
    'aguardando_pagamento'::public.agendamento_status
  );

-- =============================================================================
-- Helpers
-- =============================================================================

CREATE OR REPLACE FUNCTION public.shop_id_for_barbearia(p_barbearia_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
  FROM public.barbearias b
  JOIN public.barbershops s ON s.slug = b.slug
  WHERE b.id = p_barbearia_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.titular_shop_id_for_shop(p_shop_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT ts.id
      FROM public.barbershops cs
      JOIN public.aggregated_accounts aa
        ON aa.aggregated_user_id = cs.owner_id
       AND aa.status = 'active'::public.aggregated_account_status
      JOIN public.barbershops ts ON ts.owner_id = aa.owner_user_id
      WHERE cs.id = p_shop_id
      LIMIT 1
    ),
    p_shop_id
  );
$$;

CREATE OR REPLACE FUNCTION public.payment_destination_shop_id(p_barbearia_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH shop AS (
    SELECT public.shop_id_for_barbearia(p_barbearia_id) AS id
  ),
  titular AS (
    SELECT public.titular_shop_id_for_shop(s.id) AS id
    FROM shop s
  ),
  ca AS (
    SELECT s.id AS ca_shop_id, t.id AS titular_shop_id
    FROM shop s
    CROSS JOIN titular t
    WHERE s.id IS DISTINCT FROM t.id
  )
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM ca) THEN
      CASE
        WHEN (SELECT ts.payments_centralized FROM public.barbershops ts JOIN titular t ON t.id = ts.id) THEN
          (SELECT titular_shop_id FROM ca)
        ELSE
          (SELECT ca_shop_id FROM ca)
      END
    ELSE
      (SELECT id FROM shop)
  END;
$$;

CREATE OR REPLACE FUNCTION public.shop_has_all_active_service_prices(p_shop_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.barbershops s
    JOIN public.barbearias b ON b.slug = s.slug
    JOIN public.barbeiros br ON br.barbearia_id = b.id AND br.ativo = true
    JOIN public.barbeiro_services bs ON bs.barbeiro_id = br.id AND bs.ativo = true
    WHERE s.id = p_shop_id
      AND coalesce(bs.preco_centavos, 0) <= 0
  );
$$;

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
BEGIN
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

    IF coalesce(_price, 0) <= 0 THEN
      RETURN json_build_object('error', 'missing_price', 'service', _sn);
    END IF;
    _total := _total + _price;
  END LOOP;

  IF p_mode = 'full'::public.appointment_payment_mode THEN
    _charge := _total;
  ELSIF p_mode = 'deposit'::public.appointment_payment_mode THEN
    IF p_deposit_type = 'percent'::public.appointment_deposit_type THEN
      IF p_deposit_value IS NULL OR p_deposit_value <= 0 OR p_deposit_value > 100 THEN
        RETURN json_build_object('error', 'invalid_deposit_percent');
      END IF;
      _charge := round(_total::numeric * p_deposit_value / 100.0)::int;
    ELSIF p_deposit_type = 'fixed'::public.appointment_deposit_type THEN
      IF p_deposit_value IS NULL OR p_deposit_value <= 0 THEN
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
    _charge := 50;
  END IF;

  RETURN json_build_object(
    'total_centavos', _total,
    'charge_centavos', _charge,
    'remaining_centavos', greatest(_total - _charge, 0)
  );
END;
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
  _shop record;
  _titular_shop_id uuid;
  _is_ca boolean := false;
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
    s.appointment_deposit_value
  INTO _shop
  FROM public.barbershops s
  WHERE s.id = _config_shop_id;

  RETURN json_build_object(
    'config_shop_id', _config_shop_id,
    'destination_shop_id', _dest_shop_id,
    'is_ca', _is_ca,
    'payments_centralized', coalesce(_shop.payments_centralized, true),
    'payment_mode', _shop.appointment_payment_mode,
    'deposit_type', _shop.appointment_deposit_type,
    'deposit_value', _shop.appointment_deposit_value,
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

GRANT EXECUTE ON FUNCTION public.get_effective_appointment_payment_settings(uuid) TO anon, authenticated;

-- =============================================================================
-- Painel: ler / salvar config
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
    'all_services_have_prices', public.shop_has_all_active_service_prices(_shop.id),
    'can_enable_payment',
      _shop.stripe_connect_status = 'connected'::public.stripe_connect_status
      AND public.shop_has_all_active_service_prices(_shop.id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_panel_settings() TO authenticated;

CREATE OR REPLACE FUNCTION public.update_payment_panel_settings(
  p_payments_centralized boolean DEFAULT NULL,
  p_appointment_payment_mode text DEFAULT NULL,
  p_appointment_deposit_type text DEFAULT NULL,
  p_appointment_deposit_value int DEFAULT NULL
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

  RETURN public.get_payment_panel_settings();
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_payment_panel_settings(boolean, text, text, int) TO authenticated;

-- =============================================================================
-- Booking público: reserva aguardando pagamento
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
    _settings->>'stripe_connect_account_id' AS stripe_account_id
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
    'stripe_connect_account_id', _settings_row.stripe_account_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_public_booking_payment_hold(uuid, uuid, date, time, text, text, uuid, int, text[], text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.confirm_appointment_payment(
  p_agendamento_id uuid,
  p_payment_intent_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row record;
BEGIN
  SELECT *
  INTO _row
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
    SET status = 'cancelado'::public.agendamento_status,
        payment_status = 'cancelled'::public.appointment_payment_status
    WHERE id = p_agendamento_id;
    RETURN json_build_object('error', 'expired');
  END IF;

  UPDATE public.agendamentos
  SET
    status = 'confirmado'::public.agendamento_status,
    payment_status = 'paid'::public.appointment_payment_status,
    payment_intent_id = p_payment_intent_id,
    payment_expires_at = NULL
  WHERE id = p_agendamento_id;

  RETURN json_build_object('ok', true, 'agendamento_id', p_agendamento_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_appointment_payment(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.fail_appointment_payment(
  p_agendamento_id uuid,
  p_payment_intent_id text DEFAULT NULL
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
    payment_intent_id = coalesce(p_payment_intent_id, payment_intent_id),
    payment_expires_at = NULL
  WHERE id = p_agendamento_id
    AND status = 'aguardando_pagamento'::public.agendamento_status;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fail_appointment_payment(uuid, text) TO service_role;

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

GRANT EXECUTE ON FUNCTION public.cancel_public_booking_payment_hold(uuid, uuid) TO anon, authenticated;

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
    payment_expires_at = NULL
  WHERE a.status = 'aguardando_pagamento'::public.agendamento_status
    AND a.payment_expires_at IS NOT NULL
    AND a.payment_expires_at < now();

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

COMMENT ON FUNCTION public.expirar_agendamentos_aguardando_pagamento() IS
  'Cancela agendamentos aguardando_pagamento após payment_expires_at.';

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
