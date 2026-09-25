-- Preferências de cobrança por paciente (painel) + hold de pagamento com origem painel.

CREATE TABLE IF NOT EXISTS public.cliente_pagamento_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbearia_id uuid NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  whatsapp_digits text NOT NULL,
  appointment_payment_mode public.appointment_payment_mode NOT NULL DEFAULT 'none'::public.appointment_payment_mode,
  appointment_deposit_type public.appointment_deposit_type,
  appointment_deposit_value int,
  payment_enable_card boolean NOT NULL DEFAULT true,
  payment_enable_pix boolean NOT NULL DEFAULT true,
  payment_pass_fee_card boolean NOT NULL DEFAULT false,
  payment_pass_fee_pix boolean NOT NULL DEFAULT false,
  payment_max_installments smallint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cliente_pagamento_prefs_whatsapp_digits_check CHECK (
    whatsapp_digits ~ '^[0-9]{10,15}$'
  ),
  CONSTRAINT cliente_pagamento_prefs_unique UNIQUE (barbearia_id, whatsapp_digits)
);

CREATE INDEX IF NOT EXISTS idx_cliente_pagamento_prefs_barbearia_whatsapp
  ON public.cliente_pagamento_prefs (barbearia_id, whatsapp_digits);

ALTER TABLE public.cliente_pagamento_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY cliente_pagamento_prefs_select ON public.cliente_pagamento_prefs
  FOR SELECT TO authenticated
  USING (barbearia_id = ANY(public.painel_barbearia_ids_agendamentos_editaveis()));

CREATE POLICY cliente_pagamento_prefs_insert ON public.cliente_pagamento_prefs
  FOR INSERT TO authenticated
  WITH CHECK (barbearia_id = ANY(public.painel_barbearia_ids_agendamentos_editaveis()));

CREATE POLICY cliente_pagamento_prefs_update ON public.cliente_pagamento_prefs
  FOR UPDATE TO authenticated
  USING (barbearia_id = ANY(public.painel_barbearia_ids_agendamentos_editaveis()))
  WITH CHECK (barbearia_id = ANY(public.painel_barbearia_ids_agendamentos_editaveis()));

CREATE OR REPLACE FUNCTION public.get_cliente_pagamento_prefs(
  p_barbearia_id uuid,
  p_whatsapp_digits text
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.cliente_pagamento_prefs%ROWTYPE;
  _digits text := regexp_replace(coalesce(p_whatsapp_digits, ''), '\D', '', 'g');
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF NOT (p_barbearia_id = ANY(public.painel_barbearia_ids_agendamentos_editaveis())) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  IF length(_digits) < 10 THEN
    RETURN json_build_object('found', false);
  END IF;

  SELECT * INTO _row
  FROM public.cliente_pagamento_prefs p
  WHERE p.barbearia_id = p_barbearia_id
    AND p.whatsapp_digits = _digits;

  IF NOT FOUND THEN
    RETURN json_build_object('found', false);
  END IF;

  RETURN json_build_object(
    'found', true,
    'appointment_payment_mode', _row.appointment_payment_mode::text,
    'appointment_deposit_type', _row.appointment_deposit_type::text,
    'appointment_deposit_value', _row.appointment_deposit_value,
    'payment_enable_card', _row.payment_enable_card,
    'payment_enable_pix', _row.payment_enable_pix,
    'payment_pass_fee_card', _row.payment_pass_fee_card,
    'payment_pass_fee_pix', _row.payment_pass_fee_pix,
    'payment_max_installments', _row.payment_max_installments
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_cliente_pagamento_prefs(
  p_barbearia_id uuid,
  p_whatsapp_digits text,
  p_appointment_payment_mode text,
  p_appointment_deposit_type text DEFAULT NULL,
  p_appointment_deposit_value int DEFAULT NULL,
  p_payment_enable_card boolean DEFAULT true,
  p_payment_enable_pix boolean DEFAULT true,
  p_payment_pass_fee_card boolean DEFAULT false,
  p_payment_pass_fee_pix boolean DEFAULT false,
  p_payment_max_installments int DEFAULT 1
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _digits text := regexp_replace(coalesce(p_whatsapp_digits, ''), '\D', '', 'g');
  _mode public.appointment_payment_mode;
  _dep_type public.appointment_deposit_type;
  _max_inst smallint;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF NOT (p_barbearia_id = ANY(public.painel_barbearia_ids_agendamentos_editaveis())) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  IF length(_digits) < 10 THEN
    RETURN json_build_object('error', 'invalid_whatsapp');
  END IF;

  _mode := p_appointment_payment_mode::public.appointment_payment_mode;

  IF _mode = 'deposit'::public.appointment_payment_mode THEN
    _dep_type := coalesce(
      p_appointment_deposit_type::public.appointment_deposit_type,
      'percent'::public.appointment_deposit_type
    );
  ELSE
    _dep_type := NULL;
  END IF;

  _max_inst := LEAST(GREATEST(coalesce(p_payment_max_installments, 1), 1), 12)::smallint;

  INSERT INTO public.cliente_pagamento_prefs (
    barbearia_id,
    whatsapp_digits,
    appointment_payment_mode,
    appointment_deposit_type,
    appointment_deposit_value,
    payment_enable_card,
    payment_enable_pix,
    payment_pass_fee_card,
    payment_pass_fee_pix,
    payment_max_installments,
    updated_at
  )
  VALUES (
    p_barbearia_id,
    _digits,
    _mode,
    _dep_type,
    p_appointment_deposit_value,
    coalesce(p_payment_enable_card, true),
    coalesce(p_payment_enable_pix, true),
    coalesce(p_payment_pass_fee_card, false),
    coalesce(p_payment_pass_fee_pix, false),
    _max_inst,
    now()
  )
  ON CONFLICT (barbearia_id, whatsapp_digits) DO UPDATE SET
    appointment_payment_mode = EXCLUDED.appointment_payment_mode,
    appointment_deposit_type = EXCLUDED.appointment_deposit_type,
    appointment_deposit_value = EXCLUDED.appointment_deposit_value,
    payment_enable_card = EXCLUDED.payment_enable_card,
    payment_enable_pix = EXCLUDED.payment_enable_pix,
    payment_pass_fee_card = EXCLUDED.payment_pass_fee_card,
    payment_pass_fee_pix = EXCLUDED.payment_pass_fee_pix,
    payment_max_installments = EXCLUDED.payment_max_installments,
    updated_at = now();

  RETURN json_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_agendamento_payment_by_token(p_confirmation_token uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.agendamentos%ROWTYPE;
BEGIN
  SELECT * INTO _row
  FROM public.agendamentos a
  WHERE a.confirmation_token = p_confirmation_token;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  IF _row.status <> 'aguardando_pagamento'::public.agendamento_status THEN
    RETURN json_build_object('error', 'not_awaiting_payment', 'status', _row.status::text);
  END IF;

  RETURN json_build_object(
    'ok', true,
    'agendamento_id', _row.id,
    'confirmation_token', _row.confirmation_token,
    'payment_expires_at', _row.payment_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_panel_booking_payment_hold(
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
  _charge_base int;
  _total int;
  _remaining int;
  _expires timestamptz;
  _ag_id uuid;
  _token uuid;
  _titular uuid;
  _hold_minutes int := coalesce(
    nullif(trim(current_setting('app.appointment_payment_hold_minutes', true)), '')::int,
    15
  );
  _pass_card boolean;
  _pass_pix boolean;
  _enable_card boolean;
  _enable_pix boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF NOT (p_barbearia_id = ANY(public.painel_barbearia_ids_agendamentos_editaveis())) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

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
  _pass_card := coalesce((_settings->>'payment_pass_fee_card')::boolean, false);
  _pass_pix := coalesce((_settings->>'payment_pass_fee_pix')::boolean, false);
  _enable_card := coalesce((_settings->>'payment_enable_card')::boolean, true);
  _enable_pix := coalesce((_settings->>'payment_enable_pix')::boolean, true);

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
  _charge_base := (_calc->>'charge_centavos')::int;
  _remaining := (_calc->>'remaining_centavos')::int;
  _charge := _charge_base;

  IF _enable_card AND _pass_card THEN
    _charge := public.apply_mp_pass_fee_centavos(_charge_base, 'card', 1, true, false);
  ELSIF _enable_pix AND _pass_pix AND NOT (_enable_card AND _pass_card) THEN
    _charge := public.apply_mp_pass_fee_centavos(_charge_base, 'pix', 1, false, true);
  END IF;

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
      AND public.public_booking_hold_blocks_slot(a)
  ) THEN
    RETURN json_build_object('error', 'slot_taken');
  END IF;

  _titular := public.clinical_titular_user_id_for_barbearia(p_barbearia_id);
  IF _titular IS NULL THEN
    RETURN json_build_object('error', 'titular_not_found');
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
    valor_cobranca_base_centavos,
    valor_restante_centavos,
    payment_expires_at,
    titular_user_id
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
    'painel',
    true,
    'pending'::public.appointment_payment_status,
    _total,
    _charge,
    _charge_base,
    _remaining,
    _expires,
    _titular
  )
  RETURNING id, confirmation_token INTO _ag_id, _token;

  RETURN json_build_object(
    'ok', true,
    'agendamento_id', _ag_id,
    'confirmation_token', _token,
    'charge_centavos', _charge,
    'charge_base_centavos', _charge_base,
    'total_centavos', _total,
    'remaining_centavos', _remaining,
    'payment_expires_at', _expires
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cliente_pagamento_prefs(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_cliente_pagamento_prefs(
  uuid, text, text, text, int, boolean, boolean, boolean, boolean, int
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_agendamento_payment_by_token(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_panel_booking_payment_hold(
  uuid, uuid, date, time, text, text, uuid, int, text[], text
) TO authenticated;
