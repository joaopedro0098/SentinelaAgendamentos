-- Fase H onda 2: relatórios — escopo titular_user_id + archived_at IS NULL.

CREATE OR REPLACE FUNCTION public.get_relatorio_agendamentos(
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
  _barbearia_ids uuid[];
  _total         int;
  _total_faltas  int;
  _total_cancel  int;
  _faturamento   bigint;
  _por_barbeiro  json;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF p_data_inicio IS NULL OR p_data_fim IS NULL THEN
    RETURN json_build_object('error', 'invalid_dates');
  END IF;

  _barbearia_ids := public.painel_barbearia_ids_visiveis();

  IF coalesce(array_length(_barbearia_ids, 1), 0) > 0 THEN
    PERFORM public.expirar_agendamentos_nao_confirmados(_barbearia_ids);
  END IF;

  SELECT count(*)::int
  INTO _total
  FROM public.agendamentos a
  WHERE a.titular_user_id = public.painel_titular_user_id()
    AND a.archived_at IS NULL
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'concluido'::public.agendamento_status;

  SELECT count(*)::int
  INTO _total_faltas
  FROM public.agendamentos a
  WHERE a.titular_user_id = public.painel_titular_user_id()
    AND a.archived_at IS NULL
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'nao_veio'::public.agendamento_status;

  SELECT count(*)::int
  INTO _total_cancel
  FROM public.agendamentos a
  WHERE a.titular_user_id = public.painel_titular_user_id()
    AND a.archived_at IS NULL
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
  WHERE a.titular_user_id = public.painel_titular_user_id()
    AND a.archived_at IS NULL
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'concluido'::public.agendamento_status;

  IF coalesce(array_length(_barbearia_ids, 1), 0) > 0 THEN
    SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.total DESC, t.faltas DESC, t.cancelamentos DESC), '[]'::json)
    INTO _por_barbeiro
    FROM (
      SELECT
        br.id AS barbeiro_id,
        br.nome AS barbeiro_nome,
        count(*) FILTER (
          WHERE a.status = 'concluido'::public.agendamento_status
        )::int AS total,
        count(*) FILTER (
          WHERE a.status = 'nao_veio'::public.agendamento_status
        )::int AS faltas,
        count(*) FILTER (
          WHERE a.status = 'cancelado'::public.agendamento_status
        )::int AS cancelamentos
      FROM public.barbeiros br
      LEFT JOIN public.agendamentos a
        ON a.barbeiro_id = br.id
       AND a.titular_user_id = public.painel_titular_user_id()
       AND a.archived_at IS NULL
       AND a.data BETWEEN p_data_inicio AND p_data_fim
       AND a.status IN (
         'concluido'::public.agendamento_status,
         'nao_veio'::public.agendamento_status,
         'cancelado'::public.agendamento_status
       )
      WHERE br.barbearia_id = ANY(_barbearia_ids)
      GROUP BY br.id, br.nome
      HAVING
        count(*) FILTER (WHERE a.status = 'concluido'::public.agendamento_status) > 0
        OR count(*) FILTER (WHERE a.status = 'nao_veio'::public.agendamento_status) > 0
        OR count(*) FILTER (WHERE a.status = 'cancelado'::public.agendamento_status) > 0
    ) t;
  ELSE
    _por_barbeiro := '[]'::json;
  END IF;

  RETURN json_build_object(
    'total', _total,
    'total_faltas', _total_faltas,
    'total_cancelamentos', _total_cancel,
    'faturamento_total_centavos', _faturamento,
    'por_barbeiro', _por_barbeiro
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_relatorio_detalhes_colaborador(
  p_data_inicio date,
  p_data_fim date,
  p_barbeiro_id uuid
)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_ids uuid[];
  _items json;
  _faltas json;
  _cancelamentos json;
  _faturamento_total bigint;
  _horas_trabalhadas bigint;
  _faltas_total int;
  _cancelamentos_total int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF p_data_inicio IS NULL OR p_data_fim IS NULL OR p_barbeiro_id IS NULL THEN
    RETURN json_build_object('error', 'invalid_params');
  END IF;

  _barbearia_ids := public.painel_barbearia_ids_visiveis();

  IF coalesce(array_length(_barbearia_ids, 1), 0) > 0 THEN
    PERFORM public.expirar_agendamentos_nao_confirmados(_barbearia_ids);
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1
      FROM public.barbeiros br
      WHERE br.id = p_barbeiro_id
        AND br.barbearia_id = ANY(_barbearia_ids)
    )
    OR EXISTS (
      SELECT 1
      FROM public.agendamentos a
      WHERE a.barbeiro_id = p_barbeiro_id
        AND a.titular_user_id = public.painel_titular_user_id()
        AND a.archived_at IS NULL
        AND a.barbearia_id IS NULL
        AND a.titular_user_id = auth.uid()
    )
  ) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  SELECT
    coalesce(sum(sub.faturamento), 0),
    coalesce(sum(a.duracao_minutos), 0)
  INTO _faturamento_total, _horas_trabalhadas
  FROM public.agendamentos a
  LEFT JOIN LATERAL (
    SELECT coalesce(sum(coalesce(bs.preco_centavos, 0)), 0) AS faturamento
    FROM unnest(coalesce(a.servicos_nomes, ARRAY[]::text[])) AS sn(nome)
    LEFT JOIN public.barbeiro_services bs
      ON bs.barbeiro_id = a.barbeiro_id
     AND bs.nome = sn.nome
     AND bs.ativo = true
  ) sub ON true
  WHERE a.barbeiro_id = p_barbeiro_id
    AND a.titular_user_id = public.painel_titular_user_id()
    AND a.archived_at IS NULL
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'concluido'::public.agendamento_status;

  SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.data DESC, t.hora DESC), '[]'::json)
  INTO _items
  FROM (
    SELECT
      a.id,
      a.data,
      to_char(a.hora, 'HH24:MI') AS hora,
      a.cliente_nome,
      a.cliente_whatsapp,
      a.duracao_minutos,
      (
        SELECT coalesce(
          json_agg(
            json_build_object(
              'nome', sn.nome,
              'preco_centavos', coalesce(bs.preco_centavos, 0)
            )
            ORDER BY sn.ord
          ),
          '[]'::json
        )
        FROM unnest(coalesce(a.servicos_nomes, ARRAY[]::text[])) WITH ORDINALITY AS sn(nome, ord)
        LEFT JOIN public.barbeiro_services bs
          ON bs.barbeiro_id = a.barbeiro_id
         AND bs.nome = sn.nome
         AND bs.ativo = true
      ) AS servicos
    FROM public.agendamentos a
    WHERE a.barbeiro_id = p_barbeiro_id
      AND a.titular_user_id = public.painel_titular_user_id()
      AND a.archived_at IS NULL
      AND a.data BETWEEN p_data_inicio AND p_data_fim
      AND a.status = 'concluido'::public.agendamento_status
  ) t;

  SELECT count(*)::int
  INTO _faltas_total
  FROM public.agendamentos a
  WHERE a.barbeiro_id = p_barbeiro_id
    AND a.titular_user_id = public.painel_titular_user_id()
    AND a.archived_at IS NULL
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'nao_veio'::public.agendamento_status;

  SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.data DESC, t.hora DESC), '[]'::json)
  INTO _faltas
  FROM (
    SELECT
      a.id,
      a.data,
      to_char(a.hora, 'HH24:MI') AS hora,
      a.cliente_nome,
      a.cliente_whatsapp,
      (
        SELECT coalesce(
          json_agg(
            json_build_object(
              'nome', sn.nome,
              'preco_centavos', coalesce(bs.preco_centavos, 0)
            )
            ORDER BY sn.ord
          ),
          '[]'::json
        )
        FROM unnest(coalesce(a.servicos_nomes, ARRAY[]::text[])) WITH ORDINALITY AS sn(nome, ord)
        LEFT JOIN public.barbeiro_services bs
          ON bs.barbeiro_id = a.barbeiro_id
         AND bs.nome = sn.nome
         AND bs.ativo = true
      ) AS servicos
    FROM public.agendamentos a
    WHERE a.barbeiro_id = p_barbeiro_id
      AND a.titular_user_id = public.painel_titular_user_id()
      AND a.archived_at IS NULL
      AND a.data BETWEEN p_data_inicio AND p_data_fim
      AND a.status = 'nao_veio'::public.agendamento_status
  ) t;

  SELECT count(*)::int
  INTO _cancelamentos_total
  FROM public.agendamentos a
  WHERE a.barbeiro_id = p_barbeiro_id
    AND a.titular_user_id = public.painel_titular_user_id()
    AND a.archived_at IS NULL
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'cancelado'::public.agendamento_status;

  SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.data DESC, t.hora DESC), '[]'::json)
  INTO _cancelamentos
  FROM (
    SELECT
      a.id,
      a.data,
      to_char(a.hora, 'HH24:MI') AS hora,
      a.cliente_nome,
      a.cliente_whatsapp,
      public.agendamento_cancelado_por(a.cancelado_por, a.origem) AS cancelado_por,
      (
        SELECT coalesce(
          json_agg(
            json_build_object(
              'nome', sn.nome,
              'preco_centavos', coalesce(bs.preco_centavos, 0)
            )
            ORDER BY sn.ord
          ),
          '[]'::json
        )
        FROM unnest(coalesce(a.servicos_nomes, ARRAY[]::text[])) WITH ORDINALITY AS sn(nome, ord)
        LEFT JOIN public.barbeiro_services bs
          ON bs.barbeiro_id = a.barbeiro_id
         AND bs.nome = sn.nome
         AND bs.ativo = true
      ) AS servicos
    FROM public.agendamentos a
    WHERE a.barbeiro_id = p_barbeiro_id
      AND a.titular_user_id = public.painel_titular_user_id()
      AND a.archived_at IS NULL
      AND a.data BETWEEN p_data_inicio AND p_data_fim
      AND a.status = 'cancelado'::public.agendamento_status
  ) t;

  RETURN json_build_object(
    'items', _items,
    'faltas', _faltas,
    'cancelamentos', _cancelamentos,
    'faltas_total', coalesce(_faltas_total, 0),
    'cancelamentos_total', coalesce(_cancelamentos_total, 0),
    'faturamento_total_centavos', _faturamento_total,
    'horas_trabalhadas_minutos', _horas_trabalhadas
  );
END;
$$;

COMMENT ON FUNCTION public.get_relatorio_agendamentos(date, date) IS
  'Resumo de agendamentos concluídos, faltas e cancelamentos por período — escopo titular_user_id + archived_at IS NULL.';

COMMENT ON FUNCTION public.get_relatorio_detalhes_colaborador(date, date, uuid) IS
  'Detalhe do relatório por colaborador (concluídos, faltas, cancelamentos) — escopo titular_user_id + archived_at IS NULL.';

GRANT EXECUTE ON FUNCTION public.get_relatorio_agendamentos(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_relatorio_detalhes_colaborador(date, date, uuid) TO authenticated;
