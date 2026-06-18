-- Relatório de agendamentos confirmados para o painel do titular.
-- CT/AA: vê todos os agendamentos das suas barbearias + CAs ativas.
-- CA: vê apenas os seus próprios agendamentos confirmados.
-- Retorna: total de confirmados, total por colaborador, agrupados no período.

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
  _por_barbeiro  json;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF p_data_inicio IS NULL OR p_data_fim IS NULL THEN
    RETURN json_build_object('error', 'invalid_dates');
  END IF;

  -- Monta a lista de barbearias visíveis para este usuário.
  -- CT/AA: própria barbearia + barbearias das CAs ativas.
  -- CA: apenas a própria barbearia.
  SELECT array_agg(DISTINCT b.id)
  INTO _barbearia_ids
  FROM public.barbearias b
  JOIN public.barbershops s ON s.slug = b.slug
  WHERE
    -- Própria barbearia
    s.owner_id = auth.uid()
    OR
    -- Barbearias das CAs ativas (apenas para quem NÃO é CA)
    (
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
    RETURN json_build_object('total', 0, 'por_barbeiro', '[]'::json);
  END IF;

  -- Total de agendamentos confirmados no período
  SELECT count(*)::int
  INTO _total
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.status = 'confirmado'::public.agendamento_status
    AND a.data BETWEEN p_data_inicio AND p_data_fim;

  -- Total por colaborador
  SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::json)
  INTO _por_barbeiro
  FROM (
    SELECT
      br.id    AS barbeiro_id,
      br.nome  AS barbeiro_nome,
      count(*) ::int AS total
    FROM public.agendamentos a
    JOIN public.barbeiros br ON br.id = a.barbeiro_id
    WHERE a.barbearia_id = ANY(_barbearia_ids)
      AND a.status = 'confirmado'::public.agendamento_status
      AND a.data BETWEEN p_data_inicio AND p_data_fim
    GROUP BY br.id, br.nome
  ) t;

  RETURN json_build_object(
    'total',        _total,
    'por_barbeiro', _por_barbeiro
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_relatorio_agendamentos(date, date) TO authenticated;
