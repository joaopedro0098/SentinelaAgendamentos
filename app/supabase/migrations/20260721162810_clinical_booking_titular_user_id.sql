-- Fase H onda 1: hotfix booking — titular_user_id desde Fase F (NOT NULL).

CREATE OR REPLACE FUNCTION public.trg_set_clinical_titular_user_id_from_barbearia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.titular_user_id IS NULL AND NEW.barbearia_id IS NOT NULL THEN
    NEW.titular_user_id := public.clinical_titular_user_id_for_barbearia(NEW.barbearia_id);
  END IF;
  IF NEW.titular_user_id IS NULL THEN
    RAISE EXCEPTION 'titular_user_id is required';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clientes_set_titular_user_id ON public.clientes;
CREATE TRIGGER trg_clientes_set_titular_user_id
  BEFORE INSERT ON public.clientes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_clinical_titular_user_id_from_barbearia();

DROP TRIGGER IF EXISTS trg_agendamentos_set_titular_user_id ON public.agendamentos;
CREATE TRIGGER trg_agendamentos_set_titular_user_id
  BEFORE INSERT ON public.agendamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_clinical_titular_user_id_from_barbearia();

CREATE OR REPLACE FUNCTION public.upsert_cliente_por_whatsapp(
  _barbearia_id uuid,
  _whatsapp text,
  _nome text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _normalized text;
  _id uuid;
  _nome_informado text;
  _titular uuid;
BEGIN
  _normalized := public.cliente_whatsapp_digits(_whatsapp);
  IF length(_normalized) = 0 THEN
    _normalized := '—';
  END IF;

  _nome_informado := NULLIF(trim(COALESCE(_nome, '')), '');
  _titular := public.clinical_titular_user_id_for_barbearia(_barbearia_id);

  IF _titular IS NULL THEN
    RAISE EXCEPTION 'barbearia sem titular_user_id resolvível: %', _barbearia_id;
  END IF;

  SELECT c.id
  INTO _id
  FROM public.clientes c
  WHERE c.titular_user_id = _titular
    AND public.cliente_whatsapp_digits(c.whatsapp) = _normalized
    AND c.archived_at IS NULL
  ORDER BY c.updated_at DESC
  LIMIT 1;

  IF _id IS NOT NULL THEN
    UPDATE public.clientes
    SET updated_at = now(),
        barbearia_id = COALESCE(_barbearia_id, barbearia_id)
    WHERE id = _id;
  ELSE
    INSERT INTO public.clientes (barbearia_id, whatsapp, nome, titular_user_id)
    VALUES (
      _barbearia_id,
      _normalized,
      COALESCE(_nome_informado, 'Cliente'),
      _titular
    )
    RETURNING id INTO _id;
  END IF;

  RETURN _id;
END;
$$;

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
    'link_publico',
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
