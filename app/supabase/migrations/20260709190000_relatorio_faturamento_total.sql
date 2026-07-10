-- Relatório: faturamento total geral no resumo principal (concluídos no período).

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

  IF _barbearia_ids IS NULL OR array_length(_barbearia_ids, 1) = 0 THEN
    RETURN json_build_object(
      'total', 0,
      'total_faltas', 0,
      'total_cancelamentos', 0,
      'faturamento_total_centavos', 0,
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
    AND a.status = 'concluido'::public.agendamento_status;

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
    'faturamento_total_centavos', _faturamento,
    'por_barbeiro', _por_barbeiro
  );
END;
$$;

COMMENT ON FUNCTION public.get_relatorio_agendamentos(date, date) IS
  'Resumo de agendamentos concluídos, faltas e cancelamentos por período, com faturamento total e breakdown por colaborador.';

GRANT EXECUTE ON FUNCTION public.get_relatorio_agendamentos(date, date) TO authenticated;
