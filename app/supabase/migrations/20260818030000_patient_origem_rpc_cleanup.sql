-- Hotfix pós-sprint identidade: origem legada 'link_publico' em RPCs ainda ativas.
-- A CHECK agendamentos_origem_check (20260818000000) só aceita 'paciente_logado' | 'painel'.

-- 1. create_public_booking_payment_hold — INSERT quebrava com link_publico
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
    'paciente_logado',
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

GRANT EXECUTE ON FUNCTION public.create_public_booking_payment_hold(
  uuid, uuid, date, time, text, text, uuid, int, text[], text
) TO anon, authenticated, service_role;

-- 2. inherit_appointment_push_subscription — prioridade legada link_publico
CREATE OR REPLACE FUNCTION public.inherit_appointment_push_subscription(
  _agendamento_id uuid,
  _force_refresh boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_id uuid;
  _whatsapp text;
  _cliente_id uuid;
  _source record;
BEGIN
  SELECT a.barbearia_id, a.cliente_whatsapp, a.cliente_id
  INTO _barbearia_id, _whatsapp, _cliente_id
  FROM public.agendamentos a
  WHERE a.id = _agendamento_id;

  IF NOT FOUND OR _whatsapp IS NULL THEN
    RETURN false;
  END IF;

  IF NOT _force_refresh AND EXISTS (
    SELECT 1
    FROM public.appointment_push_subscriptions s
    WHERE s.agendamento_id = _agendamento_id
      AND s.failed_at IS NULL
  ) THEN
    RETURN false;
  END IF;

  SELECT s.endpoint, s.p256dh, s.auth
  INTO _source
  FROM public.appointment_push_subscriptions s
  INNER JOIN public.agendamentos a ON a.id = s.agendamento_id
  WHERE a.barbearia_id = _barbearia_id
    AND a.id <> _agendamento_id
    AND s.failed_at IS NULL
    AND (
      public.whatsapp_match_digits(a.cliente_whatsapp, _whatsapp)
      OR (
        _cliente_id IS NOT NULL
        AND a.cliente_id IS NOT NULL
        AND a.cliente_id = _cliente_id
      )
    )
  ORDER BY
    CASE WHEN a.origem = 'paciente_logado' THEN 0 ELSE 1 END,
    s.last_success_at DESC NULLS LAST,
    s.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.appointment_push_subscriptions (
    agendamento_id,
    endpoint,
    p256dh,
    auth,
    failed_at,
    failure_reason
  )
  VALUES (_agendamento_id, _source.endpoint, _source.p256dh, _source.auth, NULL, NULL)
  ON CONFLICT (agendamento_id, endpoint)
  DO UPDATE SET
    p256dh = EXCLUDED.p256dh,
    auth = EXCLUDED.auth,
    failed_at = NULL,
    failure_reason = NULL;

  RETURN true;
END;
$$;

-- 3. upsert_cliente_por_whatsapp — cadastro fora do fluxo controlado pelo painel
REVOKE ALL ON FUNCTION public.upsert_cliente_por_whatsapp(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_cliente_por_whatsapp(uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_cliente_por_whatsapp(uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.upsert_cliente_por_whatsapp(uuid, text, text) IS
  'Legado: upsert por WhatsApp. EXECUTE revogado para anon/authenticated — use create_paciente_cadastro_painel ou fluxo de ativação.';
