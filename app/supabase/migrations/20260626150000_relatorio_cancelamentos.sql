-- Relatório: cancelamentos + origem do cancelamento (cliente vs profissional).

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS cancelado_por text;

ALTER TABLE public.agendamentos
  DROP CONSTRAINT IF EXISTS agendamentos_cancelado_por_check;

ALTER TABLE public.agendamentos
  ADD CONSTRAINT agendamentos_cancelado_por_check
  CHECK (cancelado_por IS NULL OR cancelado_por IN ('cliente', 'profissional'));

COMMENT ON COLUMN public.agendamentos.cancelado_por IS
  'Quem cancelou: cliente (link público) ou profissional (painel).';

CREATE OR REPLACE FUNCTION public.agendamento_cancelado_por(
  p_cancelado_por text,
  p_origem text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_cancelado_por IN ('cliente', 'profissional') THEN p_cancelado_por
    WHEN p_origem = 'link_publico' THEN 'cliente'
    ELSE 'profissional'
  END;
$$;

CREATE OR REPLACE FUNCTION public.cancelar_agendamento_cliente(
  _agendamento_id uuid,
  _slug text,
  _whatsapp text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _digits text;
  _row record;
  _flags record;
BEGIN
  _digits := regexp_replace(COALESCE(_whatsapp, ''), '\D', '', 'g');
  IF length(_digits) < 10 THEN
    RAISE EXCEPTION 'WhatsApp inválido';
  END IF;

  SELECT
    a.id,
    a.barbearia_id,
    a.data,
    a.status
  INTO _row
  FROM public.agendamentos a
  JOIN public.barbearias b ON b.id = a.barbearia_id
  WHERE a.id = _agendamento_id
    AND a.barbearia_id = ANY(public.client_hub_barbearia_ids_for_slug(trim(_slug)))
    AND b.ativa = true
    AND regexp_replace(a.cliente_whatsapp, '\D', '', 'g') = _digits;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;

  IF _row.status <> 'confirmado'::public.agendamento_status THEN
    RAISE EXCEPTION 'Agendamento não pode ser cancelado';
  END IF;

  SELECT f.allow_public_booking, f.allow_self_service
  INTO _flags
  FROM public.get_client_self_service_flags_for_barbearia(_row.barbearia_id) f;

  IF NOT _flags.allow_public_booking THEN
    RAISE EXCEPTION 'Agendamento pelo link desativado pela barbearia';
  END IF;

  IF NOT _flags.allow_self_service THEN
    RAISE EXCEPTION 'Alteração pelo cliente desativada pela barbearia';
  END IF;

  IF NOT public.cliente_pode_gerenciar_agendamento(_row.data) THEN
    RAISE EXCEPTION 'Prazo para cancelar expirou';
  END IF;

  UPDATE public.agendamentos
  SET
    status = 'cancelado'::public.agendamento_status,
    cancelado_por = 'cliente'
  WHERE id = _agendamento_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.alterar_agendamento_painel(
  p_agendamento_id uuid,
  p_acao text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_id uuid;
  _status public.agendamento_status;
  _confirmed_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF p_acao NOT IN ('confirmar', 'nao_confirmado', 'cancelar') THEN
    RAISE EXCEPTION 'Ação inválida';
  END IF;

  SELECT a.barbearia_id, a.status, a.client_confirmed_at
  INTO _barbearia_id, _status, _confirmed_at
  FROM public.agendamentos a
  WHERE a.id = p_agendamento_id;

  IF _barbearia_id IS NULL THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;

  IF NOT public.painel_pode_gerenciar_agendamento(_barbearia_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar este agendamento';
  END IF;

  IF _status = 'nao_veio'::public.agendamento_status THEN
    RAISE EXCEPTION 'Use o menu de ações para agendamentos marcados como faltou';
  END IF;

  IF p_acao = 'cancelar' THEN
    IF _status <> 'confirmado'::public.agendamento_status THEN
      RAISE EXCEPTION 'Só é possível cancelar agendamentos confirmados';
    END IF;

    UPDATE public.agendamentos
    SET
      status = 'cancelado'::public.agendamento_status,
      cancelado_por = 'profissional'
    WHERE id = p_agendamento_id;

    RETURN json_build_object(
      'status', 'cancelado',
      'client_confirmed_at', _confirmed_at
    );
  END IF;

  IF p_acao = 'confirmar' THEN
    UPDATE public.agendamentos
    SET
      status = 'confirmado'::public.agendamento_status,
      client_confirmed_at = COALESCE(client_confirmed_at, now()),
      cancelado_por = NULL
    WHERE id = p_agendamento_id
    RETURNING client_confirmed_at INTO _confirmed_at;

    RETURN json_build_object(
      'status', 'confirmado',
      'client_confirmed_at', _confirmed_at
    );
  END IF;

  UPDATE public.agendamentos
  SET
    status = 'confirmado'::public.agendamento_status,
    client_confirmed_at = NULL,
    cancelado_por = NULL
  WHERE id = p_agendamento_id;

  RETURN json_build_object(
    'status', 'confirmado',
    'client_confirmed_at', NULL
  );
END;
$$;

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
  _total_cancel  int;
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
    RETURN json_build_object(
      'total', 0,
      'total_faltas', 0,
      'total_cancelamentos', 0,
      'por_barbeiro', '[]'::json
    );
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
        WHERE a.status = 'confirmado'::public.agendamento_status
          AND (
            NOT COALESCE(a.requires_client_confirmation, false)
            OR a.client_confirmed_at IS NOT NULL
          )
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
       'confirmado'::public.agendamento_status,
       'nao_veio'::public.agendamento_status,
       'cancelado'::public.agendamento_status
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
      OR count(*) FILTER (
        WHERE a.status = 'cancelado'::public.agendamento_status
      ) > 0
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
STABLE
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
    AND a.status = 'confirmado'::public.agendamento_status
    AND (
      NOT COALESCE(a.requires_client_confirmation, false)
      OR a.client_confirmed_at IS NOT NULL
    );

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
      AND a.status = 'confirmado'::public.agendamento_status
      AND (
        NOT COALESCE(a.requires_client_confirmation, false)
        OR a.client_confirmed_at IS NOT NULL
      )
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
  'Relatório: confirmados, faltas e cancelamentos por colaborador.';

COMMENT ON FUNCTION public.get_relatorio_detalhes_colaborador(date, date, uuid) IS
  'Detalhe do relatório por colaborador, incluindo cancelamentos e origem do cancelamento.';
