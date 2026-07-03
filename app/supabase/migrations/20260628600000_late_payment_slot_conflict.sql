-- Colisão de slot em pagamento tardio (Opção A: só confirmado ocupa).
-- Índice único confirmado + promote com unique_violation → pendência mp_payment_exceptions.

DROP INDEX IF EXISTS public.agendamentos_barbeiro_data_hora_ocupado_key;

CREATE UNIQUE INDEX IF NOT EXISTS agendamentos_barbeiro_data_hora_confirmado_key
  ON public.agendamentos (barbeiro_id, data, hora)
  WHERE status = 'confirmado'::public.agendamento_status;

COMMENT ON INDEX public.agendamentos_barbeiro_data_hora_confirmado_key IS
  'No máximo um agendamento confirmado por profissional/data/hora (proteção contra race no promote).';

-- =============================================================================
-- Helpers de slot e pendência
-- =============================================================================

CREATE OR REPLACE FUNCTION public.slot_is_taken_for_appointment(
  p_barbeiro_id uuid,
  p_data date,
  p_hora time,
  p_exclude_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agendamentos a
    WHERE a.barbeiro_id = p_barbeiro_id
      AND a.data = p_data
      AND a.hora = p_hora
      AND a.status = 'confirmado'::public.agendamento_status
      AND (p_exclude_id IS NULL OR a.id <> p_exclude_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.register_late_payment_slot_conflict(
  p_row public.agendamentos,
  p_mp_payment_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _exception_id uuid;
  _amount int;
BEGIN
  _amount := coalesce(
    nullif(p_row.valor_pago_centavos, 0),
    nullif(p_row.valor_cobranca_base_centavos, 0),
    nullif(p_row.valor_base_centavos, 0),
    0
  );

  INSERT INTO public.mp_payment_exceptions (
    barbearia_id,
    agendamento_id,
    mp_payment_id,
    amount_centavos,
    reason,
    status,
    metadata
  )
  VALUES (
    p_row.barbearia_id,
    p_row.id,
    p_mp_payment_id,
    _amount,
    'slot_taken_late_payment',
    'pending_resolution',
    jsonb_build_object(
      'cliente_nome', trim(coalesce(p_row.cliente_nome, '')),
      'cliente_whatsapp', coalesce(p_row.cliente_whatsapp, ''),
      'data', p_row.data,
      'hora', to_char(p_row.hora, 'HH24:MI'),
      'barbeiro_id', p_row.barbeiro_id,
      'servicos_nomes', coalesce(p_row.servicos_nomes, ARRAY[]::text[])
    )
  )
  RETURNING id INTO _exception_id;

  DELETE FROM public.agendamentos
  WHERE id = p_row.id
    AND status = 'aguardando_pagamento'::public.agendamento_status;

  RETURN json_build_object(
    'ok', true,
    'slot_conflict', true,
    'exception_id', _exception_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.promote_appointment_payment_if_slot_available(
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
    RETURN json_build_object('error', 'invalid_status', 'status', _row.status::text);
  END IF;

  IF public.slot_is_taken_for_appointment(_row.barbeiro_id, _row.data, _row.hora, _row.id) THEN
    RETURN public.register_late_payment_slot_conflict(_row, p_mp_payment_id);
  END IF;

  BEGIN
    UPDATE public.agendamentos
    SET
      status = 'confirmado'::public.agendamento_status,
      payment_status = 'paid'::public.appointment_payment_status,
      mp_payment_id = p_mp_payment_id,
      payment_expires_at = NULL,
      requires_client_confirmation = false,
      client_confirmed_at = coalesce(client_confirmed_at, now())
    WHERE id = p_agendamento_id;

    RETURN json_build_object(
      'ok', true,
      'confirmed', true,
      'agendamento_id', p_agendamento_id
    );
  EXCEPTION
    WHEN unique_violation THEN
      SELECT * INTO _row
      FROM public.agendamentos a
      WHERE a.id = p_agendamento_id;

      IF NOT FOUND OR _row.status <> 'aguardando_pagamento'::public.agendamento_status THEN
        RETURN json_build_object('ok', true, 'already_confirmed', true);
      END IF;

      RETURN public.register_late_payment_slot_conflict(_row, p_mp_payment_id);
  END;
END;
$$;

COMMENT ON FUNCTION public.promote_appointment_payment_if_slot_available(uuid, text) IS
  'Promove hold para confirmado se slot livre; senão registra pendência e exclui hold.';

GRANT EXECUTE ON FUNCTION public.promote_appointment_payment_if_slot_available(uuid, text) TO service_role;

-- =============================================================================
-- Listagem painel: snapshot em metadata (hold pode já ter sido excluído)
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
            e.metadata,
            coalesce(
              nullif(trim(e.metadata->>'cliente_nome'), ''),
              public.cliente_nome_exibicao(
                a.barbearia_id, a.cliente_id, a.cliente_whatsapp, a.cliente_nome
              )
            ) AS cliente_nome,
            coalesce(
              nullif(trim(e.metadata->>'cliente_whatsapp'), ''),
              a.cliente_whatsapp
            ) AS cliente_whatsapp,
            coalesce(
              (nullif(e.metadata->>'data', ''))::date,
              a.data
            ) AS agendamento_data,
            coalesce(
              nullif(trim(e.metadata->>'hora'), ''),
              to_char(a.hora, 'HH24:MI')
            ) AS agendamento_hora
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
