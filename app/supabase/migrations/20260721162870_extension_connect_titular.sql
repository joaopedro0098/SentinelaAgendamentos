-- Fase H onda 2: Extension Connect — escopo titular_user_id + archived_at IS NULL.

CREATE OR REPLACE FUNCTION public.painel_titular_user_id_for_user(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT aa.owner_user_id
      FROM public.aggregated_accounts aa
      WHERE aa.aggregated_user_id = p_user_id
        AND aa.status = 'active'::public.aggregated_account_status
      LIMIT 1
    ),
    p_user_id
  );
$$;

COMMENT ON FUNCTION public.painel_titular_user_id_for_user(uuid) IS
  'Titular clínico (CT) para um user_id arbitrário: owner_user_id se CA agregada ativa, senão o próprio user_id.';

CREATE OR REPLACE FUNCTION public.extension_connect_pode_ler_conteudo_anotacao(
  p_agendamento_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agendamentos a
    LEFT JOIN public.barbearias b ON b.id = a.barbearia_id
    LEFT JOIN public.barbershops s ON s.slug = b.slug
    WHERE a.id = p_agendamento_id
      AND (
        s.owner_id = p_user_id
        OR (
          a.barbearia_id IS NULL
          AND a.titular_user_id = public.painel_titular_user_id_for_user(p_user_id)
        )
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.agendamentos a
    LEFT JOIN public.barbearias ag_bb ON ag_bb.id = a.barbearia_id
    LEFT JOIN public.barbershops ag_shop ON ag_shop.slug = ag_bb.slug
    JOIN public.aggregated_accounts aa
      ON aa.aggregated_user_id = ag_shop.owner_id
     AND aa.status = 'active'::public.aggregated_account_status
    WHERE a.id = p_agendamento_id
      AND ag_shop.owner_id IS NOT NULL
      AND aa.owner_user_id = p_user_id
      AND aa.owner_can_view_annotations = true
      AND ag_shop.owner_id IS DISTINCT FROM p_user_id
  );
$$;

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
  _titular uuid;
  _nome text;
  _avatar text;
  _clinica text;
  _history json;
  _history_total int;
  _next_appointment json;
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

  _titular := public.painel_titular_user_id_for_user(p_user_id);
  _clinica := public.extension_connect_clinic_display_name(p_user_id);
  _today := (timezone('America/Sao_Paulo', now()))::date;
  _now_time := (timezone('America/Sao_Paulo', now()))::time;

  SELECT coalesce(
    (
      SELECT c.nome
      FROM public.clientes c
      WHERE c.titular_user_id = _titular
        AND c.archived_at IS NULL
        AND public.whatsapp_match_digits(c.whatsapp, _digits)
      ORDER BY c.updated_at DESC
      LIMIT 1
    ),
    (
      SELECT a.cliente_nome
      FROM public.agendamentos a
      WHERE a.titular_user_id = _titular
        AND a.archived_at IS NULL
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
  WHERE c.titular_user_id = _titular
    AND c.archived_at IS NULL
    AND public.whatsapp_match_digits(c.whatsapp, _digits)
  ORDER BY (c.avatar_url IS NOT NULL AND trim(c.avatar_url) <> '') DESC, c.updated_at DESC
  LIMIT 1;

  IF _avatar IS NOT NULL AND trim(_avatar) = '' THEN
    _avatar := NULL;
  END IF;

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
    WHERE a.titular_user_id = _titular
      AND a.archived_at IS NULL
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
    LEFT JOIN public.agendamento_anotacoes an
      ON an.agendamento_id = a.id
     AND an.archived_at IS NULL
    WHERE a.titular_user_id = _titular
      AND a.archived_at IS NULL
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
  'Painel Connect: paciente, histórico, próximo agendamento (variável %agendamento%). Escopo titular_user_id + archived_at IS NULL.';

GRANT EXECUTE ON FUNCTION public.painel_titular_user_id_for_user(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.extension_connect_pode_ler_conteudo_anotacao(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.extension_connect_client_lookup(uuid, text, text) TO service_role;
