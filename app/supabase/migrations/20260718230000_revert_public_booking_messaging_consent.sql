-- Reverte consentimento RCS/SMS no agendamento público (se aplicado).

DROP POLICY IF EXISTS "public insere agendamento" ON public.agendamentos;

ALTER TABLE public.agendamentos
  DROP COLUMN IF EXISTS messaging_consent_at,
  DROP COLUMN IF EXISTS messaging_consent_text;

CREATE POLICY "public insere agendamento" ON public.agendamentos
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    (origem IS NULL OR origem = 'link_publico')
    AND public.barbearia_pode_agendar(barbearia_id)
    AND status = 'confirmado'::public.agendamento_status
    AND public.barbearia_allows_public_booking_insert(barbearia_id)
  );

DROP FUNCTION IF EXISTS public.create_public_booking_payment_hold(
  uuid, uuid, date, time, text, text, uuid, int, text[], text, timestamptz, text
);

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
  _charge_base int;
  _total int;
  _remaining int;
  _expires timestamptz;
  _ag_id uuid;
  _token uuid;
  _hold_minutes int := coalesce(
    nullif(trim(current_setting('app.appointment_payment_hold_minutes', true)), '')::int,
    15
  );
  _pass_card boolean;
  _pass_pix boolean;
  _enable_card boolean;
  _enable_pix boolean;
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
    _charge_base,
    _remaining,
    _expires
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
    'payment_expires_at', _expires,
    'destination_shop_id', _settings->>'destination_shop_id',
    'payment_enable_card', _enable_card,
    'payment_enable_pix', _enable_pix,
    'payment_pass_fee_card', _pass_card,
    'payment_pass_fee_pix', _pass_pix,
    'payment_max_installments', (_settings->>'payment_max_installments')::int
  );
END;
$$;

DROP FUNCTION IF EXISTS public.reagendar_agendamento_cliente(
  uuid, text, text, date, time, uuid, int, text, text[], timestamptz, text
);

CREATE OR REPLACE FUNCTION public.reagendar_agendamento_cliente(
  p_agendamento_id uuid,
  p_slug text,
  p_whatsapp text,
  p_data date,
  p_hora time,
  p_barbeiro_id uuid,
  p_duracao_minutos int,
  p_observacao text DEFAULT NULL,
  p_servicos_nomes text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _digits text;
  _row record;
  _flags record;
  _old_data date;
  _old_hora time;
  _target_barbearia_id uuid;
BEGIN
  _digits := regexp_replace(COALESCE(p_whatsapp, ''), '\D', '', 'g');
  IF length(_digits) < 10 THEN
    RAISE EXCEPTION 'WhatsApp inválido';
  END IF;

  SELECT
    a.id,
    a.barbearia_id,
    a.data,
    a.hora,
    a.status
  INTO _row
  FROM public.agendamentos a
  JOIN public.barbearias b ON b.id = a.barbearia_id
  WHERE a.id = p_agendamento_id
    AND a.barbearia_id = ANY(public.client_hub_barbearia_ids_for_slug(trim(p_slug)))
    AND b.ativa = true
    AND regexp_replace(a.cliente_whatsapp, '\D', '', 'g') = _digits;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;

  IF _row.status <> 'confirmado'::public.agendamento_status THEN
    RAISE EXCEPTION 'Agendamento não pode ser alterado';
  END IF;

  SELECT f.allow_public_booking, f.allow_self_service
  INTO _flags
  FROM public.get_client_self_service_flags_for_barbearia(_row.barbearia_id) f;

  IF NOT _flags.allow_public_booking THEN
    RAISE EXCEPTION 'Agendamento pelo link desativado pela barbearia';
  END IF;

  IF NOT _flags.allow_self_service THEN
    RAISE EXCEPTION 'Alteração pelo cliente desativada pela barbearia';
  END IF;

  IF NOT public.cliente_pode_gerenciar_agendamento(_row.data) THEN
    RAISE EXCEPTION 'Prazo para alterar expirou';
  END IF;

  IF NOT public.is_booking_professional_for_slug(p_slug, p_barbeiro_id, p_data, p_data) THEN
    RAISE EXCEPTION 'Colaborador inválido';
  END IF;

  SELECT br.barbearia_id INTO _target_barbearia_id
  FROM public.barbeiros br
  WHERE br.id = p_barbeiro_id
    AND br.ativo = true;

  IF _target_barbearia_id IS NULL THEN
    RAISE EXCEPTION 'Colaborador inválido';
  END IF;

  IF p_duracao_minutos IS NULL OR p_duracao_minutos < 1 THEN
    RAISE EXCEPTION 'Duração inválida';
  END IF;

  _old_data := _row.data;
  _old_hora := _row.hora;

  UPDATE public.agendamentos
  SET
    data = p_data,
    hora = p_hora,
    barbeiro_id = p_barbeiro_id,
    barbearia_id = _target_barbearia_id,
    duracao_minutos = p_duracao_minutos,
    observacao = NULLIF(trim(COALESCE(p_observacao, observacao)), ''),
    servicos_nomes = COALESCE(p_servicos_nomes, servicos_nomes),
    client_confirmed_at = NULL,
    confirmation_push_sent_at = NULL,
    reminder_push_sent_at = NULL
  WHERE id = p_agendamento_id;

  RETURN jsonb_build_object(
    'ok', true,
    'agendamento_id', p_agendamento_id,
    'old_data', _old_data,
    'old_hora', _old_hora,
    'new_data', p_data,
    'new_hora', p_hora
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_public_booking_payment_hold(
  uuid, uuid, date, time, text, text, uuid, int, text[], text
) TO anon, authenticated, service_role;
