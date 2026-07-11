-- Pacientes: listar todos os profissionais ativos (não só com histórico).
-- Agendamentos: buscar clientes cadastrados (tabela clientes) para slot vazio.

CREATE OR REPLACE FUNCTION public.list_pacientes_painel(
  p_barbeiro_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_ids uuid[];
  _barbearia_ids_familia uuid[];
  _barbearia_ids_editaveis uuid[];
  _pacientes json;
  _profissionais json;
  _total_count int;
  _limit int;
  _offset int;
  _search text;
  _has_more boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  _limit := GREATEST(1, LEAST(COALESCE(p_limit, 50), 100));
  _offset := GREATEST(0, COALESCE(p_offset, 0));
  _search := NULLIF(trim(COALESCE(p_search, '')), '');

  _barbearia_ids := public.painel_barbearia_ids_pacientes_visiveis();
  _barbearia_ids_familia := public.painel_barbearia_ids_familia_conta();
  _barbearia_ids_editaveis := public.painel_barbearia_ids_editaveis();

  IF coalesce(array_length(_barbearia_ids, 1), 0) = 0 THEN
    RETURN json_build_object(
      'pacientes', '[]'::json,
      'profissionais', '[]'::json,
      'total_count', 0,
      'limit', _limit,
      'offset', _offset,
      'has_more', false
    );
  END IF;

  WITH matching_digits AS (
    SELECT DISTINCT c.whatsapp AS whatsapp_digits
    FROM public.clientes c
    WHERE _search IS NOT NULL
      AND c.barbearia_id = ANY(_barbearia_ids_familia)
      AND lower(c.nome) LIKE ('%' || lower(_search) || '%')
  ),
  scoped AS (
    SELECT
      public.cliente_whatsapp_digits(a.cliente_whatsapp) AS whatsapp_digits,
      a.barbearia_id,
      a.cliente_id,
      a.cliente_whatsapp,
      a.cliente_nome,
      a.data,
      a.hora,
      a.id AS agendamento_id,
      a.status
    FROM public.agendamentos a
    WHERE public.painel_agendamento_visivel_pacientes(a.barbearia_id, a.barbeiro_id, _barbearia_ids)
      AND length(public.cliente_whatsapp_digits(a.cliente_whatsapp)) >= 10
      AND (p_barbeiro_id IS NULL OR a.barbeiro_id = p_barbeiro_id)
      AND (
        a.status = 'concluido'::public.agendamento_status
        OR EXISTS (
          SELECT 1
          FROM public.agendamento_anotacoes an0
          WHERE an0.agendamento_id = a.id
        )
      )
      AND (
        _search IS NULL
        OR public.cliente_whatsapp_digits(a.cliente_whatsapp) IN (SELECT md.whatsapp_digits FROM matching_digits md)
        OR lower(a.cliente_nome) LIKE ('%' || lower(_search) || '%')
      )
  ),
  with_anot AS (
    SELECT
      s.whatsapp_digits,
      s.barbearia_id,
      s.cliente_id,
      s.cliente_whatsapp,
      s.cliente_nome,
      s.data,
      s.hora,
      s.status,
      an.id AS anotacao_id
    FROM scoped s
    LEFT JOIN public.agendamento_anotacoes an ON an.agendamento_id = s.agendamento_id
  ),
  grouped AS (
    SELECT
      g.whatsapp_digits,
      COALESCE(
        (
          SELECT c.nome
          FROM public.clientes c
          WHERE c.barbearia_id = ANY(_barbearia_ids_familia)
            AND c.whatsapp = g.whatsapp_digits
          ORDER BY c.updated_at DESC
          LIMIT 1
        ),
        (
          SELECT public.cliente_nome_exibicao(
            w.barbearia_id,
            w.cliente_id,
            w.cliente_whatsapp,
            w.cliente_nome
          )
          FROM with_anot w
          WHERE w.whatsapp_digits = g.whatsapp_digits
          ORDER BY w.data DESC, w.hora DESC
          LIMIT 1
        )
      ) AS cliente_nome,
      (
        SELECT c.data_nascimento
        FROM public.clientes c
        WHERE c.barbearia_id = ANY(_barbearia_ids_familia)
          AND c.whatsapp = g.whatsapp_digits
        ORDER BY (c.data_nascimento IS NOT NULL) DESC, c.updated_at DESC
        LIMIT 1
      ) AS data_nascimento,
      (
        SELECT c.avatar_url
        FROM public.clientes c
        WHERE c.barbearia_id = ANY(_barbearia_ids_familia)
          AND c.whatsapp = g.whatsapp_digits
        ORDER BY (c.avatar_url IS NOT NULL AND trim(c.avatar_url) <> '') DESC, c.updated_at DESC
        LIMIT 1
      ) AS avatar_url,
      max(g.data) AS ultimo_atendimento,
      count(*) FILTER (WHERE g.status = 'concluido'::public.agendamento_status)::int AS total_concluidos,
      count(g.anotacao_id)::int AS total_anotacoes,
      EXISTS (
        SELECT 1
        FROM with_anot w
        WHERE w.whatsapp_digits = g.whatsapp_digits
          AND w.barbearia_id = ANY(_barbearia_ids_editaveis)
      ) AS can_rename_nome
    FROM with_anot g
    GROUP BY g.whatsapp_digits
  ),
  filtered AS (
    SELECT *
    FROM grouped g
    WHERE _search IS NULL OR lower(g.cliente_nome) LIKE ('%' || lower(_search) || '%')
  ),
  paged AS (
    SELECT *
    FROM filtered
    ORDER BY ultimo_atendimento DESC, cliente_nome ASC
    LIMIT _limit
    OFFSET _offset
  )
  SELECT
    coalesce((SELECT json_agg(row_to_json(p) ORDER BY p.ultimo_atendimento DESC, p.cliente_nome ASC) FROM paged p), '[]'::json),
    (SELECT count(*)::int FROM filtered)
  INTO _pacientes, _total_count;

  -- Todos os profissionais ativos das barbearias visíveis (inclui recém-criados sem histórico).
  SELECT coalesce(json_agg(row_to_json(pr) ORDER BY pr.nome), '[]'::json)
  INTO _profissionais
  FROM (
    SELECT bb.id, bb.nome, bb.barbearia_id
    FROM public.barbeiros bb
    WHERE bb.barbearia_id = ANY(_barbearia_ids)
      AND bb.ativo = true
    ORDER BY bb.nome
  ) pr;

  _has_more := (_offset + json_array_length(_pacientes)) < _total_count;

  RETURN json_build_object(
    'pacientes', _pacientes,
    'profissionais', _profissionais,
    'total_count', _total_count,
    'limit', _limit,
    'offset', _offset,
    'has_more', _has_more
  );
END;
$$;

COMMENT ON FUNCTION public.list_pacientes_painel(uuid, text, int, int) IS
  'Pacientes do painel. Profissionais: todos ativos nas barbearias visíveis.';

-- Busca clientes cadastrados (tabela clientes) para agendar em slot vazio no painel.
CREATE OR REPLACE FUNCTION public.search_clientes_cadastro_painel(
  p_barbearia_id uuid,
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _limit int;
  _search text;
  _search_digits text;
  _clientes json;
  _total_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF p_barbearia_id IS NULL THEN
    RETURN json_build_object('error', 'barbearia_required');
  END IF;

  IF NOT public.painel_pode_gerenciar_agendamento(p_barbearia_id) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  _limit := GREATEST(1, LEAST(COALESCE(p_limit, 50), 100));
  _search := NULLIF(trim(COALESCE(p_search, '')), '');
  _search_digits := NULLIF(regexp_replace(COALESCE(_search, ''), '\D', '', 'g'), '');

  IF _search IS NULL OR length(_search) < 2 THEN
    RETURN json_build_object('clientes', '[]'::json, 'total_count', 0);
  END IF;

  WITH matched AS (
    SELECT
      c.whatsapp AS whatsapp_digits,
      c.nome AS cliente_nome,
      c.barbearia_id
    FROM public.clientes c
    WHERE c.barbearia_id = p_barbearia_id
      AND length(c.whatsapp) >= 10
      AND (
        lower(c.nome) LIKE ('%' || lower(_search) || '%')
        OR (
          _search_digits IS NOT NULL
          AND length(_search_digits) >= 2
          AND c.whatsapp LIKE ('%' || _search_digits || '%')
        )
      )
    ORDER BY c.nome ASC, c.updated_at DESC
    LIMIT _limit
  )
  SELECT
    coalesce(json_agg(row_to_json(m) ORDER BY m.cliente_nome), '[]'::json),
    (SELECT count(*)::int FROM matched)
  INTO _clientes, _total_count
  FROM matched m;

  RETURN json_build_object(
    'clientes', _clientes,
    'total_count', _total_count
  );
END;
$$;

COMMENT ON FUNCTION public.search_clientes_cadastro_painel(uuid, text, int) IS
  'Busca clientes cadastrados por nome/WhatsApp para agendamento no painel. Respeita painel_barbearia_ids_agendamentos_editaveis (inclui CAs com titular edita agendamentos).';

GRANT EXECUTE ON FUNCTION public.search_clientes_cadastro_painel(uuid, text, int) TO authenticated;
