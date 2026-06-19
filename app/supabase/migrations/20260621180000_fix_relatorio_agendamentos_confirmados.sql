-- Relatórios: conta só agendamentos confirmados de fato (exclui aguardando confirmação do cliente).

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
      AND a.status = 'confirmado'::public.agendamento_status
      AND (
        NOT COALESCE(a.requires_client_confirmation, false)
        OR a.client_confirmed_at IS NOT NULL
      )
  );
$$;

COMMENT ON FUNCTION public.agendamento_conta_no_relatorio(uuid) IS
  'True se o agendamento entra no relatório: status confirmado e presença confirmada quando exigida.';

GRANT EXECUTE ON FUNCTION public.agendamento_conta_no_relatorio(uuid) TO authenticated;

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
    RETURN json_build_object('total', 0, 'por_barbeiro', '[]'::json);
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
      AND a.data BETWEEN p_data_inicio AND p_data_fim
      AND a.status = 'confirmado'::public.agendamento_status
      AND (
        NOT COALESCE(a.requires_client_confirmation, false)
        OR a.client_confirmed_at IS NOT NULL
      )
    GROUP BY br.id, br.nome
  ) t;

  RETURN json_build_object(
    'total',        _total,
    'por_barbeiro', _por_barbeiro
  );
END;
$$;

COMMENT ON FUNCTION public.get_relatorio_agendamentos(date, date) IS
  'Relatório: apenas agendamentos confirmados (exclui cancelados, concluídos e aguardando confirmação do cliente).';

GRANT EXECUTE ON FUNCTION public.get_relatorio_agendamentos(date, date) TO authenticated;
