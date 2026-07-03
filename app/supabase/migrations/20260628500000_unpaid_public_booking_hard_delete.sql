-- Holds de pagamento não concluído (link público): exclusão física, sem cancelamento/relatório.
-- Expiração 15 min: slot libera na hora (ocupação só considera hold ativo); exclusão com Pix
-- pendente exige confirmação via API MP (edge mp-finalize-expired-payment-holds).

-- =============================================================================
-- Exclusão (service role / RPCs públicas)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.delete_appointment_payment_hold(p_agendamento_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.agendamentos
  WHERE id = p_agendamento_id
    AND status = 'aguardando_pagamento'::public.agendamento_status;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  RETURN json_build_object('ok', true, 'deleted', true);
END;
$$;

COMMENT ON FUNCTION public.delete_appointment_payment_hold(uuid) IS
  'Remove hold aguardando_pagamento sem rastro (cancelamento manual, falha MP, expiração sem Pix).';

GRANT EXECUTE ON FUNCTION public.delete_appointment_payment_hold(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.delete_public_booking_payment_hold(
  p_agendamento_id uuid,
  p_confirmation_token uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _status public.agendamento_status;
BEGIN
  SELECT a.status
  INTO _status
  FROM public.agendamentos a
  WHERE a.id = p_agendamento_id
    AND a.confirmation_token = p_confirmation_token;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  IF _status <> 'aguardando_pagamento'::public.agendamento_status THEN
    RETURN json_build_object('ok', true, 'already_gone', true);
  END IF;

  DELETE FROM public.agendamentos
  WHERE id = p_agendamento_id
    AND confirmation_token = p_confirmation_token
    AND status = 'aguardando_pagamento'::public.agendamento_status;

  RETURN json_build_object('ok', true, 'deleted', true);
END;
$$;

COMMENT ON FUNCTION public.delete_public_booking_payment_hold(uuid, uuid) IS
  'Cliente cancela checkout pago: exclui hold (nunca existiu agendamento confirmado).';

GRANT EXECUTE ON FUNCTION public.delete_public_booking_payment_hold(uuid, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.abandon_public_booking_payment_checkout(
  p_agendamento_id uuid,
  p_confirmation_token uuid
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
    AND a.confirmation_token = p_confirmation_token;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  IF _row.status <> 'aguardando_pagamento'::public.agendamento_status THEN
    RETURN json_build_object('ok', true, 'already_gone', true);
  END IF;

  -- Pix gerado: slot já liberou pelo relógio; registro fica até checagem MP (edge).
  IF _row.mp_payment_id IS NOT NULL THEN
    RETURN json_build_object('ok', true, 'awaiting_mp_finalize', true);
  END IF;

  DELETE FROM public.agendamentos
  WHERE id = p_agendamento_id
    AND confirmation_token = p_confirmation_token
    AND status = 'aguardando_pagamento'::public.agendamento_status;

  RETURN json_build_object('ok', true, 'deleted', true);
END;
$$;

COMMENT ON FUNCTION public.abandon_public_booking_payment_checkout(uuid, uuid) IS
  'Timer 15 min no checkout: exclui se não há Pix; se há mp_payment_id, só libera UI (MP finalize depois).';

GRANT EXECUTE ON FUNCTION public.abandon_public_booking_payment_checkout(uuid, uuid) TO anon, authenticated;

-- Compat: cancel_public_booking_payment_hold passa a excluir (não cancelar).
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
  RETURN public.delete_public_booking_payment_hold(p_agendamento_id, p_confirmation_token);
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
  IF p_mp_payment_id IS NOT NULL THEN
    UPDATE public.agendamentos
    SET mp_payment_id = p_mp_payment_id
    WHERE id = p_agendamento_id
      AND status = 'aguardando_pagamento'::public.agendamento_status
      AND mp_payment_id IS NULL;
  END IF;

  RETURN public.delete_appointment_payment_hold(p_agendamento_id);
END;
$$;

-- =============================================================================
-- Expiração SQL: só exclui holds expirados SEM mp_payment_id (sem risco Pix tardio)
-- =============================================================================

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
  DELETE FROM public.agendamentos a
  WHERE a.status = 'aguardando_pagamento'::public.agendamento_status
    AND a.payment_expires_at IS NOT NULL
    AND a.payment_expires_at < now()
    AND a.mp_payment_id IS NULL;

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

COMMENT ON FUNCTION public.expirar_agendamentos_aguardando_pagamento() IS
  'Exclui holds expirados sem Pix. Holds com mp_payment_id ficam para mp-finalize-expired-payment-holds.';

-- =============================================================================
-- Confirmação: permite Pix/cartão aprovado após os 15 min (webhook atrasado)
-- =============================================================================

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

  UPDATE public.agendamentos
  SET
    status = 'confirmado'::public.agendamento_status,
    payment_status = 'paid'::public.appointment_payment_status,
    mp_payment_id = p_mp_payment_id,
    payment_expires_at = NULL,
    requires_client_confirmation = false,
    client_confirmed_at = coalesce(client_confirmed_at, now())
  WHERE id = p_agendamento_id;

  RETURN json_build_object('ok', true, 'agendamento_id', p_agendamento_id);
END;
$$;

-- =============================================================================
-- Hold: slot só bloqueado enquanto hold ATIVO (15 min ou Pix pendente visível ao MP)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.public_booking_hold_blocks_slot(p_agendamento public.agendamentos)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_agendamento.status = 'confirmado'::public.agendamento_status
    OR (
      p_agendamento.status = 'aguardando_pagamento'::public.agendamento_status
      AND p_agendamento.payment_expires_at IS NOT NULL
      AND p_agendamento.payment_expires_at >= now()
    );
$$;

-- create_public_booking_payment_hold — conflito de slot só com hold ativo
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
    'payment_expires_at', _expires,
    'valor_pago_centavos', _charge,
    'valor_restante_centavos', _remaining
  );
END;
$$;

-- Painel: só holds ATIVOS (não mostra fantasmas pós-15 min aguardando MP finalize)
CREATE OR REPLACE FUNCTION public.get_agendamentos_painel(
  p_data_inicio date,
  p_data_fim    date
)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_ids                    uuid[];
  _barbearia_ids_agendamentos_edit  uuid[];
  _items                            json;
  _profissionais                    json;
  _total                            int;
  _confirmados                      int;
  _concluidos                       int;
  _aguardando                       int;
  _aguardando_pagamento             int;
  _cancelados                       int;
  _faturamento                      bigint;
  _status_visiveis                  public.agendamento_status[] := ARRAY[
    'confirmado'::public.agendamento_status,
    'concluido'::public.agendamento_status,
    'cancelado'::public.agendamento_status,
    'nao_veio'::public.agendamento_status,
    'aguardando_pagamento'::public.agendamento_status
  ];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF p_data_inicio IS NULL OR p_data_fim IS NULL OR p_data_fim < p_data_inicio THEN
    RETURN json_build_object('error', 'invalid_dates');
  END IF;

  _barbearia_ids := public.painel_barbearia_ids_visiveis();
  _barbearia_ids_agendamentos_edit := public.painel_barbearia_ids_agendamentos_editaveis();

  IF array_length(_barbearia_ids, 1) IS NULL OR array_length(_barbearia_ids, 1) = 0 THEN
    RETURN json_build_object(
      'items', '[]'::json,
      'profissionais', '[]'::json,
      'summary', json_build_object(
        'total', 0,
        'confirmados', 0,
        'concluidos', 0,
        'aguardando_confirmacao', 0,
        'aguardando_pagamento', 0,
        'cancelados', 0,
        'faturamento_centavos', 0
      )
    );
  END IF;

  PERFORM public.expirar_agendamentos_nao_confirmados(_barbearia_ids);
  PERFORM public.expirar_agendamentos_aguardando_pagamento();

  SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.data, t.hora, t.barbeiro_nome), '[]'::json)
  INTO _items
  FROM (
    SELECT
      a.id,
      a.data,
      to_char(a.hora, 'HH24:MI') AS hora,
      public.cliente_nome_exibicao(a.barbearia_id, a.cliente_id, a.cliente_whatsapp, a.cliente_nome) AS cliente_nome,
      a.cliente_whatsapp,
      a.duracao_minutos,
      coalesce(a.servicos_nomes, ARRAY[]::text[]) AS servicos_nomes,
      a.observacao,
      a.barbeiro_id,
      coalesce(br.nome, 'Colaborador') AS barbeiro_nome,
      a.barbearia_id,
      a.confirmation_token,
      a.client_confirmed_at,
      coalesce(a.requires_client_confirmation, false) AS requires_client_confirmation,
      a.status::text AS status,
      a.valor_base_centavos,
      a.valor_pago_centavos,
      a.valor_restante_centavos,
      a.payment_expires_at,
      a.payment_status::text AS payment_status,
      (a.barbearia_id = ANY(_barbearia_ids_agendamentos_edit)) AS can_manage
    FROM public.agendamentos a
    LEFT JOIN public.barbeiros br ON br.id = a.barbeiro_id
    WHERE a.barbearia_id = ANY(_barbearia_ids)
      AND a.data BETWEEN p_data_inicio AND p_data_fim
      AND a.status = ANY(_status_visiveis)
      AND (
        a.status <> 'aguardando_pagamento'::public.agendamento_status
        OR public.public_booking_hold_blocks_slot(a)
      )
  ) t;

  SELECT coalesce(json_agg(row_to_json(p) ORDER BY p.nome), '[]'::json)
  INTO _profissionais
  FROM (
    SELECT br.id, br.nome, br.barbearia_id
    FROM public.barbeiros br
    WHERE br.barbearia_id = ANY(_barbearia_ids)
      AND br.ativo = true

    UNION

    SELECT DISTINCT br.id, coalesce(br.nome, 'Colaborador'), a.barbearia_id
    FROM public.agendamentos a
    LEFT JOIN public.barbeiros br ON br.id = a.barbeiro_id
    WHERE a.barbearia_id = ANY(_barbearia_ids)
      AND a.data BETWEEN p_data_inicio AND p_data_fim
      AND a.status = ANY(_status_visiveis)
      AND (
        a.status <> 'aguardando_pagamento'::public.agendamento_status
        OR public.public_booking_hold_blocks_slot(a)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.barbeiros bx
        WHERE bx.id = a.barbeiro_id AND bx.ativo = true
      )
  ) p;

  SELECT count(*)::int INTO _total
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = ANY(_status_visiveis)
    AND (
      a.status <> 'aguardando_pagamento'::public.agendamento_status
      OR public.public_booking_hold_blocks_slot(a)
    );

  SELECT count(*)::int INTO _confirmados
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'confirmado'::public.agendamento_status
    AND (
      NOT coalesce(a.requires_client_confirmation, false)
      OR a.client_confirmed_at IS NOT NULL
    );

  SELECT count(*)::int INTO _concluidos
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'concluido'::public.agendamento_status;

  SELECT count(*)::int INTO _aguardando
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'confirmado'::public.agendamento_status
    AND coalesce(a.requires_client_confirmation, false)
    AND a.client_confirmed_at IS NULL;

  SELECT count(*)::int INTO _aguardando_pagamento
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'aguardando_pagamento'::public.agendamento_status
    AND public.public_booking_hold_blocks_slot(a);

  SELECT count(*)::int INTO _cancelados
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'cancelado'::public.agendamento_status;

  SELECT coalesce(sum(sub.faturamento), 0)
  INTO _faturamento
  FROM public.agendamentos a
  LEFT JOIN LATERAL (
    SELECT coalesce(sum(coalesce(bs.preco_centavos, 0)), 0) AS faturamento
    FROM unnest(coalesce(a.servicos_nomes, ARRAY[]::text[])) AS sn(nome)
    LEFT JOIN public.barbeiro_services bs
      ON bs.barbeiro_id = a.barbeiro_id
     AND bs.nome = sn.nome
     AND bs.ativo = true
  ) sub ON true
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND (
      a.status = 'concluido'::public.agendamento_status
      OR (
        a.status = 'confirmado'::public.agendamento_status
        AND (
          NOT coalesce(a.requires_client_confirmation, false)
          OR a.client_confirmed_at IS NOT NULL
        )
      )
    );

  RETURN json_build_object(
    'items', _items,
    'profissionais', _profissionais,
    'summary', json_build_object(
      'total', _total,
      'confirmados', _confirmados,
      'concluidos', _concluidos,
      'aguardando_confirmacao', _aguardando,
      'aguardando_pagamento', _aguardando_pagamento,
      'cancelados', _cancelados,
      'faturamento_centavos', _faturamento
    )
  );
END;
$$;
