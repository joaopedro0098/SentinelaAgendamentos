-- Detalhes de agendamentos por colaborador (expansão no relatório).

CREATE OR REPLACE FUNCTION public.get_relatorio_detalhes_colaborador(
  p_data_inicio date,
  p_data_fim date,
  p_barbeiro_id uuid
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_ids uuid[];
  _items json;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF p_data_inicio IS NULL OR p_data_fim IS NULL OR p_barbeiro_id IS NULL THEN
    RETURN json_build_object('error', 'invalid_params');
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
    RETURN json_build_object('items', '[]'::json);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.barbeiros br
    WHERE br.id = p_barbeiro_id
      AND br.barbearia_id = ANY(_barbearia_ids)
  ) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.data DESC, t.hora DESC), '[]'::json)
  INTO _items
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
      AND a.status = 'confirmado'::public.agendamento_status
      AND (
        NOT COALESCE(a.requires_client_confirmation, false)
        OR a.client_confirmed_at IS NOT NULL
      )
  ) t;

  RETURN json_build_object('items', _items);
END;
$$;

COMMENT ON FUNCTION public.get_relatorio_detalhes_colaborador(date, date, uuid) IS
  'Lista agendamentos confirmados de um colaborador no período (detalhe do relatório).';

GRANT EXECUTE ON FUNCTION public.get_relatorio_detalhes_colaborador(date, date, uuid) TO authenticated;
