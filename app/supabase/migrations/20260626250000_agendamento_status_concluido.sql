-- Status concluido: painel, relatórios (substitui confirmados), cron meia-noite SP.

ALTER TYPE public.agendamento_status ADD VALUE IF NOT EXISTS 'concluido';

-- Marca como concluído agendamentos confirmados do dia anterior (America/Sao_Paulo).
CREATE OR REPLACE FUNCTION public.concluir_agendamentos_confirmados_dia_anterior()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hoje date;
  _ontem date;
  _count int;
BEGIN
  _hoje := (timezone('America/Sao_Paulo', now()))::date;
  _ontem := _hoje - 1;

  UPDATE public.agendamentos a
  SET status = 'concluido'::public.agendamento_status
  WHERE a.data = _ontem
    AND a.status = 'confirmado'::public.agendamento_status;

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.concluir_agendamentos_confirmados_dia_anterior() TO authenticated;

COMMENT ON FUNCTION public.concluir_agendamentos_confirmados_dia_anterior() IS
  'Cron: converte agendamentos confirmados de ontem (SP) para concluido.';

CREATE OR REPLACE FUNCTION public.agendamento_conta_no_relatorio(p_agendamento_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agendamentos a
    WHERE a.id = p_agendamento_id
      AND a.status = 'concluido'::public.agendamento_status
  );
$$;

COMMENT ON FUNCTION public.agendamento_conta_no_relatorio(uuid) IS
  'True se o agendamento entra no relatório: status concluido.';

CREATE OR REPLACE FUNCTION public.alterar_status_agendamento_passado_painel(
  p_agendamento_id uuid,
  p_status text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_id uuid;
  _data date;
  _hoje date;
  _status public.agendamento_status;
  _confirmed_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF p_status NOT IN ('concluido', 'faltou', 'cancelado') THEN
    RAISE EXCEPTION 'Status inválido';
  END IF;

  _hoje := (timezone('America/Sao_Paulo', now()))::date;

  SELECT a.barbearia_id, a.data, a.status, a.client_confirmed_at
  INTO _barbearia_id, _data, _status, _confirmed_at
  FROM public.agendamentos a
  WHERE a.id = p_agendamento_id;

  IF _barbearia_id IS NULL THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;

  IF _data >= _hoje THEN
    RAISE EXCEPTION 'Só é possível alterar status de agendamentos de dias anteriores';
  END IF;

  IF _status NOT IN (
    'confirmado'::public.agendamento_status,
    'concluido'::public.agendamento_status,
    'nao_veio'::public.agendamento_status,
    'cancelado'::public.agendamento_status
  ) THEN
    RAISE EXCEPTION 'Status atual não permite alteração';
  END IF;

  IF NOT public.painel_pode_gerenciar_agendamento(_barbearia_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar este agendamento';
  END IF;

  IF p_status = 'faltou' THEN
    IF _status = 'nao_veio'::public.agendamento_status THEN
      RETURN json_build_object('status', 'nao_veio', 'client_confirmed_at', _confirmed_at);
    END IF;

    UPDATE public.agendamentos
    SET status = 'nao_veio'::public.agendamento_status
    WHERE id = p_agendamento_id;

    RETURN json_build_object('status', 'nao_veio', 'client_confirmed_at', _confirmed_at);
  END IF;

  IF p_status = 'cancelado' THEN
    IF _status = 'cancelado'::public.agendamento_status THEN
      RETURN json_build_object('status', 'cancelado', 'client_confirmed_at', _confirmed_at);
    END IF;

    UPDATE public.agendamentos
    SET
      status = 'cancelado'::public.agendamento_status,
      cancelado_por = 'profissional'
    WHERE id = p_agendamento_id;

    RETURN json_build_object('status', 'cancelado', 'client_confirmed_at', _confirmed_at);
  END IF;

  -- concluido
  IF _status = 'concluido'::public.agendamento_status THEN
    RETURN json_build_object('status', 'concluido', 'client_confirmed_at', _confirmed_at);
  END IF;

  UPDATE public.agendamentos
  SET
    status = 'concluido'::public.agendamento_status,
    client_confirmed_at = COALESCE(client_confirmed_at, now()),
    cancelado_por = NULL
  WHERE id = p_agendamento_id
  RETURNING client_confirmed_at INTO _confirmed_at;

  RETURN json_build_object('status', 'concluido', 'client_confirmed_at', _confirmed_at);
END;
$$;

COMMENT ON FUNCTION public.alterar_status_agendamento_passado_painel(uuid, text) IS
  'Painel: define concluido, faltou ou cancelado em agendamentos de dias anteriores.';

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
  _cancelados                       int;
  _faturamento                      bigint;
  _status_visiveis                  public.agendamento_status[] := ARRAY[
    'confirmado'::public.agendamento_status,
    'concluido'::public.agendamento_status,
    'cancelado'::public.agendamento_status,
    'nao_veio'::public.agendamento_status
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
        'cancelados', 0,
        'faturamento_centavos', 0
      )
    );
  END IF;

  PERFORM public.expirar_agendamentos_nao_confirmados(_barbearia_ids);

  SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.data, t.hora, t.barbeiro_nome), '[]'::json)
  INTO _items
  FROM (
    SELECT
      a.id,
      a.data,
      to_char(a.hora, 'HH24:MI') AS hora,
      a.cliente_nome,
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
      'cancelados', _cancelados,
      'faturamento_centavos', _faturamento
    )
  );
END;
$$;

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
  _por_barbeiro  json;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF p_data_inicio IS NULL OR p_data_fim IS NULL THEN
    RETURN json_build_object('error', 'invalid_dates');
  END IF;

  _barbearia_ids := public.painel_barbearia_ids_visiveis();

  IF _barbearia_ids IS NULL OR array_length(_barbearia_ids, 1) = 0 THEN
    RETURN json_build_object(
      'total', 0,
      'total_faltas', 0,
      'total_cancelamentos', 0,
      'por_barbeiro', '[]'::json
    );
  END IF;

  PERFORM public.expirar_agendamentos_nao_confirmados(_barbearia_ids);

  SELECT count(*)::int
  INTO _total
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'concluido'::public.agendamento_status;

  SELECT count(*)::int
  INTO _total_faltas
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'nao_veio'::public.agendamento_status;

  SELECT count(*)::int
  INTO _total_cancel
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'cancelado'::public.agendamento_status;

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
     AND a.barbearia_id = ANY(_barbearia_ids)
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

  RETURN json_build_object(
    'total', _total,
    'total_faltas', _total_faltas,
    'total_cancelamentos', _total_cancel,
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

  IF _barbearia_ids IS NULL OR array_length(_barbearia_ids, 1) = 0 THEN
    RETURN json_build_object(
      'items', '[]'::json,
      'faltas', '[]'::json,
      'cancelamentos', '[]'::json,
      'faltas_total', 0,
      'cancelamentos_total', 0,
      'faturamento_total_centavos', 0,
      'horas_trabalhadas_minutos', 0
    );
  END IF;

  PERFORM public.expirar_agendamentos_nao_confirmados(_barbearia_ids);

  IF NOT EXISTS (
    SELECT 1
    FROM public.barbeiros br
    WHERE br.id = p_barbeiro_id
      AND br.barbearia_id = ANY(_barbearia_ids)
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
    AND a.barbearia_id = ANY(_barbearia_ids)
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
      AND a.barbearia_id = ANY(_barbearia_ids)
      AND a.data BETWEEN p_data_inicio AND p_data_fim
      AND a.status = 'concluido'::public.agendamento_status
  ) t;

  SELECT count(*)::int
  INTO _faltas_total
  FROM public.agendamentos a
  WHERE a.barbeiro_id = p_barbeiro_id
    AND a.barbearia_id = ANY(_barbearia_ids)
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
      AND a.barbearia_id = ANY(_barbearia_ids)
      AND a.data BETWEEN p_data_inicio AND p_data_fim
      AND a.status = 'nao_veio'::public.agendamento_status
  ) t;

  SELECT count(*)::int
  INTO _cancelamentos_total
  FROM public.agendamentos a
  WHERE a.barbeiro_id = p_barbeiro_id
    AND a.barbearia_id = ANY(_barbearia_ids)
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
      AND a.barbearia_id = ANY(_barbearia_ids)
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
  'Relatório: agendamentos concluídos, faltas e cancelamentos por colaborador.';

COMMENT ON FUNCTION public.get_relatorio_detalhes_colaborador(date, date, uuid) IS
  'Relatório: detalhes de concluídos, faltas e cancelamentos de um colaborador.';

-- Cron diário 00:05 America/Sao_Paulo (após expirar não confirmados às 00:00).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('concluir-confirmados-daily');
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      'concluir-confirmados-daily',
      '5 3 * * *',
      'SELECT public.concluir_agendamentos_confirmados_dia_anterior();'
    );

    RAISE NOTICE 'Cron concluir-confirmados-daily agendado (03:05 UTC = 00:05 America/Sao_Paulo).';
  ELSE
    RAISE NOTICE 'pg_cron indisponível; conclusão automática não agendada.';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Falha ao agendar cron concluir-confirmados: %', SQLERRM;
END;
$$;
