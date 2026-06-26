-- CT/AA: visualiza CAs (agendamentos, relatórios, bloqueios); edita só a própria barbearia.
-- AA possui os mesmos relacionamentos que CT (sem exigir plano pago).

-- =============================================================================
-- Helpers de visibilidade / edição
-- =============================================================================

COMMENT ON FUNCTION public.painel_barbearia_ids_editaveis() IS
  'Barbearias que o usuário autenticado pode alterar no painel (titular direto: CT/AA própria ou CA).';

COMMENT ON FUNCTION public.painel_barbearia_ids_visiveis() IS
  'Barbearias visíveis no painel: titular direto + CAs ativas (CT/AA). CA agregada vê só a própria.';

CREATE OR REPLACE FUNCTION public.painel_pode_ver_barbershop(p_barbershop_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.user_owns_barbershop(p_barbershop_id)
    OR EXISTS (
      SELECT 1
      FROM public.barbershops s
      JOIN public.barbearias b ON b.slug = s.slug
      WHERE s.id = p_barbershop_id
        AND b.id = ANY(public.painel_barbearia_ids_visiveis())
    );
$$;

COMMENT ON FUNCTION public.painel_pode_ver_barbershop(uuid) IS
  'True se o usuário pode ler dados do painel desta barbershop (própria ou CA visível ao CT/AA).';

GRANT EXECUTE ON FUNCTION public.painel_pode_ver_barbershop(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.painel_pode_gerenciar_barbeiro(p_barbeiro_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.barbeiros br
    WHERE br.id = p_barbeiro_id
      AND br.barbearia_id = ANY(public.painel_barbearia_ids_editaveis())
  );
$$;

COMMENT ON FUNCTION public.painel_pode_gerenciar_barbeiro(uuid) IS
  'True se o usuário pode criar/editar bloqueios deste barbeiro (somente barbearias editáveis; CT não edita CAs).';

-- =============================================================================
-- RLS agendamentos: CT não atualiza/insere na barbearia das CAs
-- =============================================================================

DROP POLICY IF EXISTS "public insere agendamento" ON public.agendamentos;
CREATE POLICY "public insere agendamento" ON public.agendamentos
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    (origem IS NULL OR origem = 'link_publico')
    AND public.barbearia_pode_agendar(barbearia_id)
    AND status = 'confirmado'::public.agendamento_status
    AND public.barbearia_allows_public_booking_insert(barbearia_id)
  );

DROP POLICY IF EXISTS "owner inserts agendamento painel" ON public.agendamentos;
CREATE POLICY "owner inserts agendamento painel" ON public.agendamentos
  FOR INSERT TO authenticated
  WITH CHECK (
    origem = 'painel'
    AND status = 'confirmado'::public.agendamento_status
    AND public.barbearia_pode_agendar(barbearia_id)
    AND barbearia_id = ANY(public.painel_barbearia_ids_editaveis())
  );

DROP POLICY IF EXISTS "owner updates agendamentos" ON public.agendamentos;
CREATE POLICY "owner updates agendamentos" ON public.agendamentos
  FOR UPDATE TO authenticated
  USING (
    barbearia_id = ANY(public.painel_barbearia_ids_editaveis())
  );

-- =============================================================================
-- reagendar_agendamento: mesma regra das demais ações do painel
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reagendar_agendamento(
  p_agendamento_id   uuid,
  p_data             date,
  p_hora             time,
  p_barbeiro_id      uuid,
  p_duracao_minutos  int,
  p_observacao       text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT a.barbearia_id INTO _barbearia_id
  FROM public.agendamentos a
  WHERE a.id = p_agendamento_id AND a.status = 'confirmado';

  IF _barbearia_id IS NULL THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;

  IF NOT public.painel_pode_gerenciar_agendamento(_barbearia_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar este agendamento';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.barbeiros bb
    WHERE bb.id = p_barbeiro_id AND bb.barbearia_id = _barbearia_id AND bb.ativo = true
  ) THEN
    RAISE EXCEPTION 'Colaborador inválido';
  END IF;

  IF p_duracao_minutos IS NULL OR p_duracao_minutos < 1 THEN
    RAISE EXCEPTION 'Duração inválida';
  END IF;

  UPDATE public.agendamentos
  SET
    data              = p_data,
    hora              = p_hora,
    barbeiro_id       = p_barbeiro_id,
    duracao_minutos   = p_duracao_minutos,
    observacao        = NULLIF(trim(COALESCE(p_observacao, observacao)), '')
  WHERE id = p_agendamento_id;
END;
$$;

COMMENT ON FUNCTION public.reagendar_agendamento(uuid, date, time, uuid, int, text) IS
  'Painel: reagenda agendamento confirmado. CT/AA só altera agendamentos da própria barbearia.';

-- =============================================================================
-- get_booking_professionals: p_hub_only restringe ao hub (painel Agendar CT/AA)
-- =============================================================================

DROP FUNCTION IF EXISTS public.get_booking_professionals(text, date, date);

CREATE OR REPLACE FUNCTION public.get_booking_professionals(
  p_slug text,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_hub_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hub_slug text;
  _shop record;
  _is_ca boolean;
  _ca_slug text;
  _barbearia_ids uuid[];
  _result jsonb;
BEGIN
  _hub_slug := trim(p_slug);
  IF _hub_slug = '' THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT * INTO _shop
  FROM public.barbershops
  WHERE slug = _hub_slug
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN '[]'::jsonb;
  END IF;

  _is_ca := EXISTS (
    SELECT 1
    FROM public.aggregated_accounts aa
    WHERE aa.aggregated_user_id = _shop.owner_id
      AND aa.status = 'active'::public.aggregated_account_status
  );

  PERFORM public.ensure_agenda_from_barbershop_slug(_hub_slug);

  IF NOT _is_ca AND NOT COALESCE(p_hub_only, false) THEN
    FOR _ca_slug IN
      SELECT cs.slug
      FROM public.aggregated_accounts aa
      JOIN public.barbershops cs ON cs.owner_id = aa.aggregated_user_id
      WHERE aa.owner_user_id = _shop.owner_id
        AND aa.status = 'active'::public.aggregated_account_status
    LOOP
      PERFORM public.ensure_agenda_from_barbershop_slug(_ca_slug);
    END LOOP;
  END IF;

  IF COALESCE(p_hub_only, false) AND NOT _is_ca THEN
    SELECT coalesce(array_agg(b.id), ARRAY[]::uuid[])
    INTO _barbearia_ids
    FROM public.barbearias b
    WHERE b.slug = _hub_slug
      AND b.ativa = true;
  ELSE
    _barbearia_ids := public.client_hub_barbearia_ids_for_slug(_hub_slug);
  END IF;

  IF _barbearia_ids IS NULL OR cardinality(_barbearia_ids) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(row ORDER BY source_order, nome), '[]'::jsonb)
  INTO _result
  FROM (
    SELECT
      br.id AS barbeiro_id,
      br.barbearia_id,
      br.nome,
      br.foto_url,
      COALESCE(br.slot_minutos, 30) AS slot_minutos,
      CASE WHEN bb.slug <> _hub_slug THEN 1 ELSE 0 END AS source_order,
      (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'dia_semana', d.dia_semana,
          'hora_inicio', d.hora_inicio,
          'hora_fim', d.hora_fim
        ) ORDER BY d.dia_semana, d.hora_inicio), '[]'::jsonb)
        FROM public.disponibilidades d
        WHERE d.barbeiro_id = br.id
      ) AS disponibilidades,
      (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'data', bl.data,
          'hora_inicio', bl.hora_inicio,
          'hora_fim', bl.hora_fim
        ) ORDER BY bl.data), '[]'::jsonb)
        FROM public.bloqueios bl
        WHERE bl.barbeiro_id = br.id
          AND (p_from IS NULL OR bl.data >= p_from)
          AND (p_to IS NULL OR bl.data <= p_to)
      ) AS bloqueios,
      (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', bs.id,
          'nome', bs.nome,
          'duracao_minutos', bs.duracao_minutos
        ) ORDER BY bs.nome), '[]'::jsonb)
        FROM public.barbeiro_services bs
        WHERE bs.barbeiro_id = br.id
          AND bs.ativo = true
      ) AS servicos
    FROM public.barbeiros br
    JOIN public.barbearias bb ON bb.id = br.barbearia_id
    WHERE br.barbearia_id = ANY(_barbearia_ids)
      AND br.ativo = true
  ) row;

  RETURN COALESCE(_result, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_booking_professionals(text, date, date, boolean) IS
  'Profissionais para agendamento. Hub CT/AA inclui CAs (p_hub_only=false); painel Agendar usa p_hub_only=true.';

GRANT EXECUTE ON FUNCTION public.get_booking_professionals(text, date, date, boolean) TO anon, authenticated;

-- =============================================================================
-- Relatórios: barbearias visíveis + expirar não confirmados antes da consulta
-- =============================================================================

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

-- =============================================================================
-- Bloqueios: CT/AA lê hub + CAs; só edita barbeiros editáveis
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_bloqueios_painel(
  p_barbershop_id uuid,
  p_from          date,
  p_to            date
)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _slug text;
  _hoje date;
  _is_viewer_ca boolean;
  _result json;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF NOT public.painel_pode_ver_barbershop(p_barbershop_id) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  SELECT bs.slug INTO _slug
  FROM public.barbershops bs
  WHERE bs.id = p_barbershop_id
  LIMIT 1;

  IF _slug IS NULL THEN
    RETURN json_build_object('error', 'shop_not_found');
  END IF;

  PERFORM public.ensure_agenda_from_barbershop_slug(_slug);

  _hoje := (timezone('America/Sao_Paulo', now()))::date;

  _is_viewer_ca := EXISTS (
    SELECT 1
    FROM public.aggregated_accounts aa
    JOIN public.barbershops bs ON bs.owner_id = aa.aggregated_user_id
    WHERE bs.id = p_barbershop_id
      AND aa.status = 'active'::public.aggregated_account_status
  );

  SELECT json_build_object(
    'profissionais', COALESCE((
      SELECT json_agg(json_build_object(
        'staff_id', s.id,
        'nome', s.name,
        'barbeiro_id', br.id,
        'slot_minutos', COALESCE(br.slot_minutos, 30),
        'disponibilidades', (
          SELECT COALESCE(json_agg(json_build_object(
            'dia_semana', d.dia_semana,
            'hora_inicio', d.hora_inicio,
            'hora_fim', d.hora_fim
          ) ORDER BY d.dia_semana, d.hora_inicio), '[]'::json)
          FROM public.disponibilidades d
          WHERE d.barbeiro_id = br.id
        )
      ) ORDER BY s.sort_order, s.name)
      FROM public.staff s
      JOIN public.barbeiros br ON br.staff_id = s.id
      WHERE s.barbershop_id = p_barbershop_id
        AND s.is_active = true
    ), '[]'::json),
    'bloqueios', COALESCE((
      SELECT json_agg(json_build_object(
        'id', bx.id,
        'barbeiro_id', bx.barbeiro_id,
        'nome', bx.nome,
        'data', bx.data,
        'hora_inicio', bx.hora_inicio,
        'hora_fim', bx.hora_fim,
        'motivo', bx.motivo,
        'observacao', bx.observacao,
        'is_ca', bx.is_ca
      ) ORDER BY bx.data, bx.is_ca, bx.nome, bx.hora_inicio NULLS FIRST)
      FROM (
        SELECT
          bl.id,
          br.id AS barbeiro_id,
          s.name AS nome,
          bl.data,
          bl.hora_inicio,
          bl.hora_fim,
          bl.motivo,
          bl.observacao,
          false AS is_ca
        FROM public.bloqueios bl
        JOIN public.barbeiros br ON br.id = bl.barbeiro_id
        JOIN public.staff s ON s.id = br.staff_id
        WHERE s.barbershop_id = p_barbershop_id
          AND s.is_active = true
          AND bl.data BETWEEN p_from AND p_to

        UNION ALL

        SELECT
          bl.id,
          br.id AS barbeiro_id,
          s.name AS nome,
          bl.data,
          bl.hora_inicio,
          bl.hora_fim,
          bl.motivo,
          bl.observacao,
          true AS is_ca
        FROM public.bloqueios bl
        JOIN public.barbeiros br ON br.id = bl.barbeiro_id
        JOIN public.staff s ON s.id = br.staff_id
        JOIN public.barbershops cs ON cs.id = s.barbershop_id
        JOIN public.aggregated_accounts aa
          ON aa.aggregated_user_id = cs.owner_id
         AND aa.status = 'active'::public.aggregated_account_status
        JOIN public.barbershops hub ON hub.id = p_barbershop_id
          AND hub.owner_id = aa.owner_user_id
        WHERE NOT _is_viewer_ca
          AND s.is_active = true
          AND bl.data BETWEEN p_from AND p_to
      ) bx
    ), '[]'::json),
    'ferias_programadas', COALESCE((
      SELECT json_agg(json_build_object(
        'barbeiro_id', fp.barbeiro_id,
        'nome', fp.nome,
        'data_inicio', fp.data_inicio,
        'data_fim', fp.data_fim,
        'is_ca', fp.is_ca
      ) ORDER BY fp.is_ca, fp.nome, fp.data_inicio)
      FROM (
        WITH ferias_dias_proprios AS (
          SELECT
            br.id AS barbeiro_id,
            s.name AS nome,
            bl.data,
            bl.data - (ROW_NUMBER() OVER (PARTITION BY br.id ORDER BY bl.data))::int AS grp
          FROM public.bloqueios bl
          JOIN public.barbeiros br ON br.id = bl.barbeiro_id
          JOIN public.staff s ON s.id = br.staff_id
          WHERE s.barbershop_id = p_barbershop_id
            AND s.is_active = true
            AND bl.motivo = 'ferias'
            AND bl.hora_inicio IS NULL
            AND bl.hora_fim IS NULL
        ),
        periodos_proprios AS (
          SELECT
            barbeiro_id,
            nome,
            MIN(data) AS data_inicio,
            MAX(data) AS data_fim,
            false AS is_ca
          FROM ferias_dias_proprios
          GROUP BY barbeiro_id, nome, grp
        ),
        ferias_dias_ca AS (
          SELECT
            br.id AS barbeiro_id,
            s.name AS nome,
            bl.data,
            bl.data - (ROW_NUMBER() OVER (PARTITION BY br.id ORDER BY bl.data))::int AS grp
          FROM public.bloqueios bl
          JOIN public.barbeiros br ON br.id = bl.barbeiro_id
          JOIN public.staff s ON s.id = br.staff_id
          JOIN public.barbershops cs ON cs.id = s.barbershop_id
          JOIN public.aggregated_accounts aa
            ON aa.aggregated_user_id = cs.owner_id
           AND aa.status = 'active'::public.aggregated_account_status
          JOIN public.barbershops hub ON hub.id = p_barbershop_id
            AND hub.owner_id = aa.owner_user_id
          WHERE NOT _is_viewer_ca
            AND s.is_active = true
            AND bl.motivo = 'ferias'
            AND bl.hora_inicio IS NULL
            AND bl.hora_fim IS NULL
        ),
        periodos_ca AS (
          SELECT
            barbeiro_id,
            nome,
            MIN(data) AS data_inicio,
            MAX(data) AS data_fim,
            true AS is_ca
          FROM ferias_dias_ca
          GROUP BY barbeiro_id, nome, grp
        )
        SELECT * FROM periodos_proprios WHERE data_fim >= _hoje
        UNION ALL
        SELECT * FROM periodos_ca WHERE data_fim >= _hoje
      ) fp
    ), '[]'::json)
  ) INTO _result;

  RETURN _result;
END;
$$;

COMMENT ON FUNCTION public.get_bloqueios_painel(uuid, date, date) IS
  'Painel Bloqueios: leitura no hub CT/AA inclui CAs; CT/AA só edita bloqueios da própria barbearia.';
