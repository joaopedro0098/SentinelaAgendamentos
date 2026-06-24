-- Relatório: totais de faltas por colaborador no resumo principal.

CREATE OR REPLACE FUNCTION public.get_relatorio_agendamentos(
  p_data_inicio date,
  p_data_fim    date
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_ids uuid[];
  _total         int;
  _total_faltas  int;
  _por_barbeiro  json;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF p_data_inicio IS NULL OR p_data_fim IS NULL THEN
    RETURN json_build_object('error', 'invalid_dates');
  END IF;

  SELECT array_agg(DISTINCT b.id)
  INTO _barbearia_ids
  FROM public.barbearias b
  JOIN public.barbershops s ON s.slug = b.slug
  WHERE
    s.owner_id = auth.uid()
    OR (
      NOT EXISTS (
        SELECT 1 FROM public.aggregated_accounts aa
        WHERE aa.aggregated_user_id = auth.uid()
          AND aa.status = 'active'::public.aggregated_account_status
      )
      AND EXISTS (
        SELECT 1 FROM public.aggregated_accounts aa
        WHERE aa.owner_user_id = auth.uid()
          AND aa.aggregated_user_id = s.owner_id
          AND aa.status = 'active'::public.aggregated_account_status
      )
    );

  IF _barbearia_ids IS NULL OR array_length(_barbearia_ids, 1) = 0 THEN
    RETURN json_build_object('total', 0, 'total_faltas', 0, 'por_barbeiro', '[]'::json);
  END IF;

  SELECT count(*)::int
  INTO _total
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'confirmado'::public.agendamento_status
    AND (
      NOT COALESCE(a.requires_client_confirmation, false)
      OR a.client_confirmed_at IS NOT NULL
    );

  SELECT count(*)::int
  INTO _total_faltas
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'nao_veio'::public.agendamento_status;

  SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.total DESC, t.faltas DESC), '[]'::json)
  INTO _por_barbeiro
  FROM (
    SELECT
      br.id AS barbeiro_id,
      br.nome AS barbeiro_nome,
      count(*) FILTER (
        WHERE a.status = 'confirmado'::public.agendamento_status
          AND (
            NOT COALESCE(a.requires_client_confirmation, false)
            OR a.client_confirmed_at IS NOT NULL
          )
      )::int AS total,
      count(*) FILTER (
        WHERE a.status = 'nao_veio'::public.agendamento_status
      )::int AS faltas
    FROM public.barbeiros br
    LEFT JOIN public.agendamentos a
      ON a.barbeiro_id = br.id
     AND a.barbearia_id = ANY(_barbearia_ids)
     AND a.data BETWEEN p_data_inicio AND p_data_fim
     AND a.status IN (
       'confirmado'::public.agendamento_status,
       'nao_veio'::public.agendamento_status
     )
    WHERE br.barbearia_id = ANY(_barbearia_ids)
    GROUP BY br.id, br.nome
    HAVING
      count(*) FILTER (
        WHERE a.status = 'confirmado'::public.agendamento_status
          AND (
            NOT COALESCE(a.requires_client_confirmation, false)
            OR a.client_confirmed_at IS NOT NULL
          )
      ) > 0
      OR count(*) FILTER (
        WHERE a.status = 'nao_veio'::public.agendamento_status
      ) > 0
  ) t;

  RETURN json_build_object(
    'total',        _total,
    'total_faltas', _total_faltas,
    'por_barbeiro', _por_barbeiro
  );
END;
$$;

COMMENT ON FUNCTION public.get_relatorio_agendamentos(date, date) IS
  'Relatório: confirmados (com confirmação quando exigida) e contagem de faltas por colaborador.';

GRANT EXECUTE ON FUNCTION public.get_relatorio_agendamentos(date, date) TO authenticated;
