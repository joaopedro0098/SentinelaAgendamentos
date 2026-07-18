-- Connect: lista de agendamentos futuros no painel (coluna direita).

CREATE OR REPLACE FUNCTION public.extension_connect_client_lookup(
  p_user_id uuid,
  p_phone text,
  p_display_name text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _digits text;
  _barbearia_ids uuid[];
  _familia_ids uuid[];
  _nome text;
  _avatar text;
  _clinica text;
  _history json;
  _history_total int;
  _next_appointment json;
  _future_appointments json;
  _today date;
  _now_time time;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN json_build_object('error', 'invalid_user');
  END IF;

  _digits := public.cliente_whatsapp_digits(p_phone);
  IF length(_digits) < 10 OR length(_digits) > 13 THEN
    RETURN json_build_object('error', 'invalid_phone', 'phone_digits', _digits);
  END IF;

  _clinica := public.extension_connect_clinic_display_name(p_user_id);
  _barbearia_ids := public.painel_barbearia_ids_pacientes_visiveis_for_user(p_user_id);
  _familia_ids := public.painel_barbearia_ids_familia_conta_for_user(p_user_id);
  _today := (timezone('America/Sao_Paulo', now()))::date;
  _now_time := (timezone('America/Sao_Paulo', now()))::time;

  IF coalesce(array_length(_barbearia_ids, 1), 0) = 0 THEN
    RETURN json_build_object(
      'phone_digits', _digits,
      'clinic_display_name', _clinica,
      'next_appointment', NULL,
      'future_appointments', '[]'::json,
      'patient', json_build_object(
        'nome', coalesce(nullif(trim(p_display_name), ''), 'Paciente'),
        'avatar_url', NULL,
        'whatsapp_digits', _digits
      ),
      'history', '[]'::json,
      'history_total', 0,
      'history_has_more', false
    );
  END IF;

  SELECT coalesce(
    (
      SELECT c.nome
      FROM public.clientes c
      WHERE c.barbearia_id = ANY(_familia_ids)
        AND public.whatsapp_match_digits(c.whatsapp, _digits)
      ORDER BY c.updated_at DESC
      LIMIT 1
    ),
    (
      SELECT a.cliente_nome
      FROM public.agendamentos a
      WHERE public.painel_agendamento_visivel_pacientes(a.barbearia_id, a.barbeiro_id, _barbearia_ids)
        AND public.whatsapp_match_digits(a.cliente_whatsapp, _digits)
      ORDER BY a.data DESC, a.hora DESC
      LIMIT 1
    ),
    nullif(trim(p_display_name), ''),
    'Paciente'
  )
  INTO _nome;

  SELECT c.avatar_url
  INTO _avatar
  FROM public.clientes c
  WHERE c.barbearia_id = ANY(_familia_ids)
    AND public.whatsapp_match_digits(c.whatsapp, _digits)
  ORDER BY (c.avatar_url IS NOT NULL AND trim(c.avatar_url) <> '') DESC, c.updated_at DESC
  LIMIT 1;

  IF _avatar IS NOT NULL AND trim(_avatar) = '' THEN
    _avatar := NULL;
  END IF;

  SELECT coalesce(json_agg(row_to_json(f) ORDER BY f.data ASC, f.hora ASC), '[]'::json)
  INTO _future_appointments
  FROM (
    SELECT
      a.id AS agendamento_id,
      a.data,
      to_char(a.hora, 'HH24:MI') AS hora,
      a.duracao_minutos,
      coalesce(bb.slot_minutos, 30) AS slot_minutos,
      bb.nome AS barbeiro_nome,
      to_jsonb(coalesce(a.servicos_nomes, ARRAY[]::text[])) AS servicos_nomes,
      a.status::text AS status
    FROM public.agendamentos a
    JOIN public.barbeiros bb ON bb.id = a.barbeiro_id
    WHERE public.painel_agendamento_visivel_pacientes(a.barbearia_id, a.barbeiro_id, _barbearia_ids)
      AND public.whatsapp_match_digits(a.cliente_whatsapp, _digits)
      AND a.status IN (
        'confirmado'::public.agendamento_status,
        'aguardando_pagamento'::public.agendamento_status
      )
      AND (
        a.data > _today
        OR (a.data = _today AND a.hora >= _now_time)
      )
    ORDER BY a.data ASC, a.hora ASC
    LIMIT 4
  ) f;

  SELECT row_to_json(n)
  INTO _next_appointment
  FROM (
    SELECT
      a.id AS agendamento_id,
      a.data,
      to_char(a.hora, 'HH24:MI') AS hora,
      a.duracao_minutos,
      coalesce(bb.slot_minutos, 30) AS slot_minutos,
      bb.nome AS barbeiro_nome
    FROM public.agendamentos a
    JOIN public.barbeiros bb ON bb.id = a.barbeiro_id
    WHERE public.painel_agendamento_visivel_pacientes(a.barbearia_id, a.barbeiro_id, _barbearia_ids)
      AND public.whatsapp_match_digits(a.cliente_whatsapp, _digits)
      AND a.status IN (
        'confirmado'::public.agendamento_status,
        'aguardando_pagamento'::public.agendamento_status
      )
      AND (
        a.data > _today
        OR (a.data = _today AND a.hora >= _now_time)
      )
    ORDER BY a.data ASC, a.hora ASC
    LIMIT 1
  ) n;

  SELECT coalesce(json_agg(row_to_json(x) ORDER BY x.data DESC, x.hora DESC), '[]'::json)
  INTO _history
  FROM (
    SELECT
      a.id AS agendamento_id,
      a.data,
      to_char(a.hora, 'HH24:MI') AS hora,
      a.duracao_minutos,
      coalesce(bb.slot_minutos, 30) AS slot_minutos,
      bb.nome AS barbeiro_nome,
      to_jsonb(coalesce(a.servicos_nomes, ARRAY[]::text[])) AS servicos_nomes,
      CASE
        WHEN public.extension_connect_pode_ler_conteudo_anotacao(a.id, p_user_id) THEN an.conteudo
        ELSE NULL
      END AS anotacao_conteudo
    FROM public.agendamentos a
    JOIN public.barbeiros bb ON bb.id = a.barbeiro_id
    LEFT JOIN public.agendamento_anotacoes an ON an.agendamento_id = a.id
    WHERE public.painel_agendamento_visivel_pacientes(a.barbearia_id, a.barbeiro_id, _barbearia_ids)
      AND public.whatsapp_match_digits(a.cliente_whatsapp, _digits)
      AND (
        a.status = 'concluido'::public.agendamento_status
        OR an.id IS NOT NULL
      )
  ) x;

  _history_total := coalesce(json_array_length(_history), 0);

  RETURN json_build_object(
    'phone_digits', _digits,
    'clinic_display_name', _clinica,
    'next_appointment', _next_appointment,
    'future_appointments', _future_appointments,
    'patient', json_build_object(
      'nome', _nome,
      'avatar_url', _avatar,
      'whatsapp_digits', _digits
    ),
    'history', _history,
    'history_total', _history_total,
    'history_has_more', _history_total > 4
  );
END;
$$;

COMMENT ON FUNCTION public.extension_connect_client_lookup(uuid, text, text) IS
  'Painel Connect: paciente, últimos agendamentos, futuros e %agendamento%.';
