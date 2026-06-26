-- Painel Agendamentos: CT visualiza CAs (somente leitura); CA só vê/edita a própria barbearia.

CREATE OR REPLACE FUNCTION public.painel_barbearia_ids_editaveis()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT b.id), ARRAY[]::uuid[])
  FROM public.barbearias b
  JOIN public.barbershops s ON s.slug = b.slug
  WHERE s.owner_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.painel_barbearia_ids_visiveis()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT b.id), ARRAY[]::uuid[])
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
$$;

GRANT EXECUTE ON FUNCTION public.painel_barbearia_ids_editaveis() TO authenticated;
GRANT EXECUTE ON FUNCTION public.painel_barbearia_ids_visiveis() TO authenticated;

-- Só o titular direto da barbearia pode alterar/excluir (CT não edita CAs).
CREATE OR REPLACE FUNCTION public.painel_pode_gerenciar_agendamento(p_barbearia_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_barbearia_id = ANY(public.painel_barbearia_ids_editaveis());
$$;

CREATE OR REPLACE FUNCTION public.expirar_agendamentos_nao_confirmados_painel()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_ids uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;

  _barbearia_ids := public.painel_barbearia_ids_visiveis();

  IF array_length(_barbearia_ids, 1) IS NULL OR array_length(_barbearia_ids, 1) = 0 THEN
    RETURN 0;
  END IF;

  RETURN public.expirar_agendamentos_nao_confirmados(_barbearia_ids);
END;
$$;

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
  _barbearia_ids          uuid[];
  _barbearia_ids_editaveis uuid[];
  _items                  json;
  _profissionais          json;
  _total                  int;
  _confirmados            int;
  _aguardando             int;
  _cancelados             int;
  _faturamento            bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF p_data_inicio IS NULL OR p_data_fim IS NULL OR p_data_fim < p_data_inicio THEN
    RETURN json_build_object('error', 'invalid_dates');
  END IF;

  _barbearia_ids := public.painel_barbearia_ids_visiveis();
  _barbearia_ids_editaveis := public.painel_barbearia_ids_editaveis();

  IF array_length(_barbearia_ids, 1) IS NULL OR array_length(_barbearia_ids, 1) = 0 THEN
    RETURN json_build_object(
      'items', '[]'::json,
      'profissionais', '[]'::json,
      'summary', json_build_object(
        'total', 0,
        'confirmados', 0,
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
      br.nome AS barbeiro_nome,
      a.barbearia_id,
      a.confirmation_token,
      a.client_confirmed_at,
      coalesce(a.requires_client_confirmation, false) AS requires_client_confirmation,
      a.status::text AS status,
      (a.barbearia_id = ANY(_barbearia_ids_editaveis)) AS can_manage
    FROM public.agendamentos a
    JOIN public.barbeiros br ON br.id = a.barbeiro_id
    WHERE a.barbearia_id = ANY(_barbearia_ids)
      AND a.data BETWEEN p_data_inicio AND p_data_fim
      AND a.status IN (
        'confirmado'::public.agendamento_status,
        'cancelado'::public.agendamento_status,
        'nao_veio'::public.agendamento_status
      )
  ) t;

  SELECT coalesce(json_agg(row_to_json(p) ORDER BY p.nome), '[]'::json)
  INTO _profissionais
  FROM (
    SELECT br.id, br.nome, br.barbearia_id
    FROM public.barbeiros br
    WHERE br.barbearia_id = ANY(_barbearia_ids)
      AND br.ativo = true
  ) p;

  SELECT count(*)::int
  INTO _total
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status IN (
      'confirmado'::public.agendamento_status,
      'cancelado'::public.agendamento_status,
      'nao_veio'::public.agendamento_status
    );

  SELECT count(*)::int
  INTO _confirmados
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'confirmado'::public.agendamento_status
    AND (
      NOT coalesce(a.requires_client_confirmation, false)
      OR a.client_confirmed_at IS NOT NULL
    );

  SELECT count(*)::int
  INTO _aguardando
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'confirmado'::public.agendamento_status
    AND coalesce(a.requires_client_confirmation, false)
    AND a.client_confirmed_at IS NULL;

  SELECT count(*)::int
  INTO _cancelados
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
    AND a.status = 'confirmado'::public.agendamento_status
    AND (
      NOT coalesce(a.requires_client_confirmation, false)
      OR a.client_confirmed_at IS NOT NULL
    );

  RETURN json_build_object(
    'items', _items,
    'profissionais', _profissionais,
    'summary', json_build_object(
      'total', _total,
      'confirmados', _confirmados,
      'aguardando_confirmacao', _aguardando,
      'cancelados', _cancelados,
      'faturamento_centavos', _faturamento
    )
  );
END;
$$;

COMMENT ON FUNCTION public.get_agendamentos_painel(date, date) IS
  'Painel Agendamentos: CT vê própria barbearia + CAs (can_manage=false nas CAs); CA só vê a própria.';
