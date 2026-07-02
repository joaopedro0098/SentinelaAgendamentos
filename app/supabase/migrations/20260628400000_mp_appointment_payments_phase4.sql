-- Fase 4: repasse taxas MP, painel aguardando_pagamento, exceções Pix, expiração com Pix pendente.

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS valor_cobranca_base_centavos int;

COMMENT ON COLUMN public.agendamentos.valor_cobranca_base_centavos IS
  'Valor online antes do repasse de taxas MP (centavos).';

-- =============================================================================
-- Repasse estimado (taxas MP BR — ajustáveis; 1x cartão sem juros extra ao cliente)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.apply_mp_pass_fee_centavos(
  p_charge_centavos int,
  p_method text,
  p_installments int DEFAULT 1,
  p_pass_fee_card boolean DEFAULT false,
  p_pass_fee_pix boolean DEFAULT false
)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  _fee_bps int := 0;
  _inst int := greatest(coalesce(p_installments, 1), 1);
  _method text := lower(trim(coalesce(p_method, '')));
BEGIN
  IF coalesce(p_charge_centavos, 0) <= 0 THEN
    RETURN 0;
  END IF;

  IF _method = 'pix' AND coalesce(p_pass_fee_pix, false) THEN
    _fee_bps := 99; -- ~0,99%
  ELSIF _method IN ('card', 'credit_card', 'debit_card') AND coalesce(p_pass_fee_card, false) THEN
    _fee_bps := 498; -- ~4,98% cartão (estimativa)
    IF _inst > 1 THEN
      _fee_bps := _fee_bps + (_inst - 1) * 150; -- ~1,5% por parcela extra (2x+)
    END IF;
  ELSE
    RETURN p_charge_centavos;
  END IF;

  RETURN round(p_charge_centavos::numeric * (10000 + _fee_bps) / 10000.0)::int;
END;
$$;

COMMENT ON FUNCTION public.apply_mp_pass_fee_centavos(int, text, int, boolean, boolean) IS
  'Aplica repasse estimado de taxas MP ao valor cobrado online (centavos).';

GRANT EXECUTE ON FUNCTION public.apply_mp_pass_fee_centavos(int, text, int, boolean, boolean)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resolve_appointment_charge_centavos(
  p_agendamento_id uuid,
  p_method text,
  p_installments int DEFAULT 1,
  p_pass_fee_card boolean DEFAULT false,
  p_pass_fee_pix boolean DEFAULT false
)
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _base int;
BEGIN
  SELECT coalesce(a.valor_cobranca_base_centavos, a.valor_pago_centavos, 0)
  INTO _base
  FROM public.agendamentos a
  WHERE a.id = p_agendamento_id;

  IF coalesce(_base, 0) <= 0 THEN
    RETURN 0;
  END IF;

  RETURN public.apply_mp_pass_fee_centavos(
    _base,
    p_method,
    greatest(coalesce(p_installments, 1), 1),
    coalesce(p_pass_fee_card, false),
    coalesce(p_pass_fee_pix, false)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_appointment_charge_centavos(uuid, text, int, boolean, boolean)
  TO service_role;

-- =============================================================================
-- Hold: valor cobrado inclui repasse estimado (cartão 1x ou Pix)
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

-- =============================================================================
-- Expiração: não cancelar hold com Pix gerado (mp_payment_id) — aguarda webhook/verify
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
  UPDATE public.agendamentos a
  SET
    status = 'cancelado'::public.agendamento_status,
    payment_status = 'cancelled'::public.appointment_payment_status,
    payment_expires_at = NULL,
    cancelado_por = 'sistema'
  WHERE a.status = 'aguardando_pagamento'::public.agendamento_status
    AND a.payment_expires_at IS NOT NULL
    AND a.payment_expires_at < now()
    AND a.mp_payment_id IS NULL;

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

-- =============================================================================
-- Exceções Pix tardio — listagem painel
-- =============================================================================

CREATE OR REPLACE FUNCTION public.list_mp_payment_exceptions(p_limit int DEFAULT 50)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_ids uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  _barbearia_ids := public.painel_barbearia_ids_visiveis();
  IF array_length(_barbearia_ids, 1) IS NULL THEN
    RETURN json_build_object('items', '[]'::json);
  END IF;

  RETURN json_build_object(
    'items',
    coalesce(
      (
        SELECT json_agg(row_to_json(t) ORDER BY t.created_at DESC)
        FROM (
          SELECT
            e.id,
            e.barbearia_id,
            e.agendamento_id,
            e.mp_payment_id,
            e.amount_centavos,
            e.reason,
            e.status,
            e.created_at,
            e.resolved_at,
            a.data AS agendamento_data,
            to_char(a.hora, 'HH24:MI') AS agendamento_hora,
            public.cliente_nome_exibicao(
              a.barbearia_id, a.cliente_id, a.cliente_whatsapp, a.cliente_nome
            ) AS cliente_nome
          FROM public.mp_payment_exceptions e
          LEFT JOIN public.agendamentos a ON a.id = e.agendamento_id
          WHERE e.barbearia_id = ANY(_barbearia_ids)
            AND e.resolved_at IS NULL
          ORDER BY e.created_at DESC
          LIMIT greatest(coalesce(p_limit, 50), 1)
        ) t
      ),
      '[]'::json
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_mp_payment_exception(p_exception_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_ids uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  _barbearia_ids := public.painel_barbearia_ids_visiveis();

  UPDATE public.mp_payment_exceptions e
  SET resolved_at = now()
  WHERE e.id = p_exception_id
    AND e.barbearia_id = ANY(_barbearia_ids)
    AND e.resolved_at IS NULL;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_mp_payment_exceptions(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_mp_payment_exception(uuid) TO authenticated;

-- =============================================================================
-- Painel: aguardando_pagamento + campos de pagamento
-- =============================================================================

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
      AND NOT EXISTS (
        SELECT 1 FROM public.barbeiros bx
        WHERE bx.id = a.barbeiro_id AND bx.ativo = true
      )
  ) p;

  SELECT count(*)::int INTO _total
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = ANY(_status_visiveis);

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
    AND a.status = 'aguardando_pagamento'::public.agendamento_status;

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
