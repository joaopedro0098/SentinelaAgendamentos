BEGIN;
-- migration: 20260721162820_rpc_pacientes_titular.sql
-- Fase H onda 2: RPCs pacientes/cadastro — escopo titular_user_id + archived_at IS NULL.

CREATE OR REPLACE FUNCTION public.cliente_nome_exibicao(
  p_barbearia_id uuid,
  p_cliente_id uuid,
  p_cliente_whatsapp text,
  p_fallback text
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT c.nome
      FROM public.clientes c
      WHERE c.id = p_cliente_id
        AND c.archived_at IS NULL
    ),
    (
      SELECT c.nome
      FROM public.clientes c
      WHERE c.whatsapp = public.cliente_whatsapp_digits(p_cliente_whatsapp)
        AND c.titular_user_id = public.clinical_titular_user_id_for_barbearia(p_barbearia_id)
        AND c.archived_at IS NULL
      ORDER BY c.updated_at DESC
      LIMIT 1
    ),
    (
      SELECT c.nome
      FROM public.clientes c
      WHERE c.barbearia_id = p_barbearia_id
        AND c.whatsapp = public.cliente_whatsapp_digits(p_cliente_whatsapp)
        AND c.archived_at IS NULL
      LIMIT 1
    ),
    NULLIF(trim(p_fallback), '')
  );
$$;

COMMENT ON FUNCTION public.cliente_nome_exibicao(uuid, uuid, text, text) IS
  'Nome exibido: cadastro em clientes (canonical) ou fallback do agendamento.';

CREATE OR REPLACE FUNCTION public.get_cliente_cadastro_por_whatsapp(
  p_barbearia_id uuid,
  p_whatsapp text
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _digits text;
  _titular uuid;
  _row record;
BEGIN
  _digits := public.cliente_whatsapp_digits(p_whatsapp);
  IF length(_digits) < 10 THEN
    RETURN NULL;
  END IF;

  _titular := public.clinical_titular_user_id_for_barbearia(p_barbearia_id);

  SELECT c.id, c.nome, c.whatsapp
  INTO _row
  FROM public.clientes c
  WHERE c.titular_user_id = _titular
    AND c.archived_at IS NULL
    AND c.whatsapp = _digits
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN json_build_object(
    'id', _row.id,
    'nome', _row.nome,
    'whatsapp', _row.whatsapp
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cliente_cadastro_por_whatsapp(uuid, text) TO anon, authenticated;

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
    WHERE c.titular_user_id = public.clinical_titular_user_id_for_barbearia(p_barbearia_id)
      AND c.archived_at IS NULL
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
  _titular uuid := public.painel_titular_user_id();
  _barbearia_ids uuid[];
  _barbearia_ids_editaveis uuid[];
  _pacientes json;
  _profissionais json;
  _total_count int;
  _limit int;
  _offset int;
  _search text;
  _search_digits text;
  _has_more boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  _limit := GREATEST(1, LEAST(COALESCE(p_limit, 50), 100));
  _offset := GREATEST(0, COALESCE(p_offset, 0));
  _search := NULLIF(trim(COALESCE(p_search, '')), '');
  _search_digits := NULLIF(regexp_replace(COALESCE(_search, ''), '\D', '', 'g'), '');

  _barbearia_ids := public.painel_barbearia_ids_pacientes_visiveis();
  _barbearia_ids_editaveis := public.painel_barbearia_ids_editaveis();

  -- Sem early-return por _barbearia_ids vazio: órfãos (barbearia_id NULL) do titular
  -- entram via OR nas CTEs; lista vazia só se nada casar com titular + archived_at IS NULL.

  WITH matching_digits AS (
    SELECT DISTINCT c.whatsapp AS whatsapp_digits
    FROM public.clientes c
    WHERE _search IS NOT NULL
      AND c.titular_user_id = _titular
      AND c.archived_at IS NULL
      AND (
        lower(c.nome) LIKE ('%' || lower(_search) || '%')
        OR (
          _search_digits IS NOT NULL
          AND length(_search_digits) >= 4
          AND (
            c.whatsapp LIKE ('%' || _search_digits || '%')
            OR public.whatsapp_match_digits(c.whatsapp, _search_digits)
          )
        )
      )
    UNION
    SELECT DISTINCT public.cliente_whatsapp_digits(a.cliente_whatsapp) AS whatsapp_digits
    FROM public.agendamentos a
    WHERE _search IS NOT NULL
      AND _search_digits IS NOT NULL
      AND length(_search_digits) >= 4
      AND a.titular_user_id = _titular
      AND a.archived_at IS NULL
      AND (
        public.painel_agendamento_visivel_pacientes(a.barbearia_id, a.barbeiro_id, _barbearia_ids)
        OR (a.barbearia_id IS NULL AND a.titular_user_id = _titular)
      )
      AND public.whatsapp_match_digits(a.cliente_whatsapp, _search_digits)
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
    WHERE a.titular_user_id = _titular
      AND a.archived_at IS NULL
      AND (
        public.painel_agendamento_visivel_pacientes(a.barbearia_id, a.barbeiro_id, _barbearia_ids)
        OR (a.barbearia_id IS NULL AND a.titular_user_id = _titular)
      )
      AND length(public.cliente_whatsapp_digits(a.cliente_whatsapp)) >= 10
      AND (p_barbeiro_id IS NULL OR a.barbeiro_id = p_barbeiro_id)
      AND (
        a.status = 'concluido'::public.agendamento_status
        OR EXISTS (
          SELECT 1
          FROM public.agendamento_anotacoes an0
          WHERE an0.agendamento_id = a.id
            AND an0.archived_at IS NULL
        )
      )
      AND (
        _search IS NULL
        OR public.cliente_whatsapp_digits(a.cliente_whatsapp) IN (SELECT md.whatsapp_digits FROM matching_digits md)
        OR lower(a.cliente_nome) LIKE ('%' || lower(_search) || '%')
        OR (
          _search_digits IS NOT NULL
          AND length(_search_digits) >= 4
          AND public.whatsapp_match_digits(a.cliente_whatsapp, _search_digits)
        )
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
    LEFT JOIN public.agendamento_anotacoes an
      ON an.agendamento_id = s.agendamento_id
     AND an.archived_at IS NULL
  ),
  appt_grouped AS (
    SELECT
      g.whatsapp_digits,
      COALESCE(
        (
          SELECT c.nome
          FROM public.clientes c
          WHERE c.titular_user_id = _titular
            AND c.archived_at IS NULL
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
        WHERE c.titular_user_id = _titular
          AND c.archived_at IS NULL
          AND c.whatsapp = g.whatsapp_digits
        ORDER BY (c.data_nascimento IS NOT NULL) DESC, c.updated_at DESC
        LIMIT 1
      ) AS data_nascimento,
      (
        SELECT c.avatar_url
        FROM public.clientes c
        WHERE c.titular_user_id = _titular
          AND c.archived_at IS NULL
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
          AND (
            w.barbearia_id = ANY(_barbearia_ids_editaveis)
            OR (w.barbearia_id IS NULL AND auth.uid() = _titular)
          )
      ) AS can_rename_nome
    FROM with_anot g
    GROUP BY g.whatsapp_digits
  ),
  cadastro_only AS (
    SELECT DISTINCT ON (c.whatsapp)
      c.whatsapp AS whatsapp_digits,
      c.nome AS cliente_nome,
      c.data_nascimento,
      c.avatar_url,
      COALESCE(c.updated_at::date, CURRENT_DATE) AS ultimo_atendimento,
      0 AS total_concluidos,
      0 AS total_anotacoes,
      (
        c.barbearia_id = ANY(_barbearia_ids_editaveis)
        OR (c.barbearia_id IS NULL AND auth.uid() = _titular)
      ) AS can_rename_nome
    FROM public.clientes c
    WHERE _search IS NOT NULL
      AND c.titular_user_id = _titular
      AND c.archived_at IS NULL
      AND length(c.whatsapp) >= 10
      AND (
        lower(c.nome) LIKE ('%' || lower(_search) || '%')
        OR (
          _search_digits IS NOT NULL
          AND length(_search_digits) >= 4
          AND (
            c.whatsapp LIKE ('%' || _search_digits || '%')
            OR public.whatsapp_match_digits(c.whatsapp, _search_digits)
          )
        )
      )
    ORDER BY c.whatsapp, c.updated_at DESC
  ),
  grouped AS (
    SELECT * FROM appt_grouped
    UNION ALL
    SELECT co.*
    FROM cadastro_only co
    WHERE NOT EXISTS (
      SELECT 1 FROM appt_grouped ag WHERE ag.whatsapp_digits = co.whatsapp_digits
    )
  ),
  filtered AS (
    SELECT *
    FROM grouped g
    WHERE _search IS NULL
      OR lower(g.cliente_nome) LIKE ('%' || lower(_search) || '%')
      OR (
        _search_digits IS NOT NULL
        AND length(_search_digits) >= 4
        AND (
          g.whatsapp_digits LIKE ('%' || _search_digits || '%')
          OR public.whatsapp_match_digits(g.whatsapp_digits, _search_digits)
        )
      )
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

  SELECT coalesce(json_agg(row_to_json(pr) ORDER BY pr.nome), '[]'::json)
  INTO _profissionais
  FROM (
    SELECT DISTINCT bb.id, bb.nome, bb.barbearia_id
    FROM public.barbeiros bb
    WHERE bb.barbearia_id = ANY(_barbearia_ids)
      AND bb.ativo = true
      AND EXISTS (
        SELECT 1
        FROM public.agendamentos ag
        WHERE ag.barbeiro_id = bb.id
          AND ag.titular_user_id = _titular
          AND ag.archived_at IS NULL
          AND (
            ag.status = 'concluido'::public.agendamento_status
            OR EXISTS (
              SELECT 1
              FROM public.agendamento_anotacoes an
              WHERE an.agendamento_id = ag.id
                AND an.archived_at IS NULL
            )
          )
      )
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
  'Pacientes do painel. Busca por nome ou WhatsApp. Inclui cadastro sem histórico quando há pesquisa.';

GRANT EXECUTE ON FUNCTION public.list_pacientes_painel(uuid, text, int, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_paciente_cadastro_painel(
  p_whatsapp text,
  p_nome text,
  p_data_nascimento date DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _titular uuid := public.painel_titular_user_id();
  _digits text;
  _nome text;
  _barbearia_ids uuid[];
  _barbearia_id uuid;
  _existing_nome text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  _digits := public.cliente_whatsapp_digits(p_whatsapp);
  IF length(_digits) < 10 OR length(_digits) > 13 THEN
    RETURN json_build_object('error', 'invalid_whatsapp');
  END IF;

  _nome := trim(COALESCE(p_nome, ''));
  IF length(_nome) = 0 OR length(_nome) > 120 THEN
    RETURN json_build_object('error', 'invalid_name');
  END IF;

  _barbearia_ids := public.painel_barbearia_ids_editaveis();
  IF coalesce(array_length(_barbearia_ids, 1), 0) = 0 THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  _barbearia_id := _barbearia_ids[1];

  SELECT c.nome
  INTO _existing_nome
  FROM public.clientes c
  WHERE c.titular_user_id = _titular
    AND c.archived_at IS NULL
    AND public.whatsapp_match_digits(c.whatsapp, _digits)
  ORDER BY c.updated_at DESC
  LIMIT 1;

  IF _existing_nome IS NOT NULL THEN
    RETURN json_build_object(
      'error', 'already_exists',
      'whatsapp_digits', _digits,
      'cliente_nome', _existing_nome
    );
  END IF;

  INSERT INTO public.clientes (barbearia_id, nome, whatsapp, data_nascimento, titular_user_id)
  VALUES (_barbearia_id, _nome, _digits, p_data_nascimento, _titular);

  RETURN json_build_object(
    'ok', true,
    'patient', json_build_object(
      'whatsapp_digits', _digits,
      'cliente_nome', _nome,
      'data_nascimento', p_data_nascimento,
      'avatar_url', NULL,
      'ultimo_atendimento', CURRENT_DATE,
      'total_concluidos', 0,
      'total_anotacoes', 0,
      'can_rename_nome', true
    )
  );
END;
$$;

COMMENT ON FUNCTION public.create_paciente_cadastro_painel(text, text, date) IS
  'Cria cadastro de paciente (clientes) nas barbearias editáveis do usuário, sem exigir agendamento.';

GRANT EXECUTE ON FUNCTION public.create_paciente_cadastro_painel(text, text, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_paciente_data_nascimento_painel(
  p_whatsapp_digits text,
  p_data_nascimento date DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _titular uuid := public.painel_titular_user_id();
  _digits text;
  _barbearia_ids_autor uuid[];
  _cliente_id uuid;
  _barbearia_id uuid;
  _nome text;
  _updated int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  _digits := public.cliente_whatsapp_digits(p_whatsapp_digits);
  IF length(_digits) < 10 THEN
    RETURN json_build_object('error', 'invalid_whatsapp');
  END IF;

  _barbearia_ids_autor := public.painel_barbearia_ids_editaveis();

  IF coalesce(array_length(_barbearia_ids_autor, 1), 0) = 0 THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.agendamentos a
    WHERE a.titular_user_id = _titular
      AND a.archived_at IS NULL
      AND a.barbearia_id = ANY(_barbearia_ids_autor)
      AND public.cliente_whatsapp_digits(a.cliente_whatsapp) = _digits
      AND (
        a.status = 'concluido'::public.agendamento_status
        OR EXISTS (
          SELECT 1
          FROM public.agendamento_anotacoes an
          WHERE an.agendamento_id = a.id
            AND an.archived_at IS NULL
        )
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.clientes c
    WHERE c.titular_user_id = _titular
      AND c.archived_at IS NULL
      AND c.barbearia_id = ANY(_barbearia_ids_autor)
      AND public.whatsapp_match_digits(c.whatsapp, _digits)
  ) THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  SELECT c.id
  INTO _cliente_id
  FROM public.clientes c
  WHERE c.titular_user_id = _titular
    AND c.archived_at IS NULL
    AND public.whatsapp_match_digits(c.whatsapp, _digits)
  ORDER BY c.updated_at DESC
  LIMIT 1;

  IF _cliente_id IS NOT NULL THEN
    UPDATE public.clientes
    SET data_nascimento = p_data_nascimento, updated_at = now()
    WHERE id = _cliente_id;
    _updated := 1;
  ELSE
    SELECT a.barbearia_id, a.cliente_nome
    INTO _barbearia_id, _nome
    FROM public.agendamentos a
    WHERE a.titular_user_id = _titular
      AND a.archived_at IS NULL
      AND public.cliente_whatsapp_digits(a.cliente_whatsapp) = _digits
    ORDER BY a.data DESC, a.hora DESC
    LIMIT 1;

    IF _barbearia_id IS NULL THEN
      _barbearia_id := _barbearia_ids_autor[1];
      _nome := 'Cliente';
    END IF;

    INSERT INTO public.clientes (barbearia_id, nome, whatsapp, data_nascimento, titular_user_id)
    VALUES (_barbearia_id, _nome, _digits, p_data_nascimento, _titular);
    _updated := 1;
  END IF;

  RETURN json_build_object(
    'ok', true,
    'whatsapp_digits', _digits,
    'data_nascimento', p_data_nascimento,
    'updated_clientes', _updated
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_paciente_data_nascimento_painel(text, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_paciente_avatar_painel(
  p_whatsapp_digits text,
  p_avatar_url text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _titular uuid := public.painel_titular_user_id();
  _digits text;
  _barbearia_ids_autor uuid[];
  _cliente_id uuid;
  _barbearia_id uuid;
  _nome text;
  _updated int;
  _avatar text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  _digits := public.cliente_whatsapp_digits(p_whatsapp_digits);
  IF length(_digits) < 10 THEN
    RETURN json_build_object('error', 'invalid_whatsapp');
  END IF;

  _avatar := NULLIF(trim(coalesce(p_avatar_url, '')), '');
  IF _avatar IS NOT NULL AND length(_avatar) > 2048 THEN
    RETURN json_build_object('error', 'invalid_avatar_url');
  END IF;

  _barbearia_ids_autor := public.painel_barbearia_ids_editaveis();

  IF coalesce(array_length(_barbearia_ids_autor, 1), 0) = 0 THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.agendamentos a
    WHERE a.titular_user_id = _titular
      AND a.archived_at IS NULL
      AND a.barbearia_id = ANY(_barbearia_ids_autor)
      AND public.cliente_whatsapp_digits(a.cliente_whatsapp) = _digits
      AND (
        a.status = 'concluido'::public.agendamento_status
        OR EXISTS (
          SELECT 1
          FROM public.agendamento_anotacoes an
          WHERE an.agendamento_id = a.id
            AND an.archived_at IS NULL
        )
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.clientes c
    WHERE c.titular_user_id = _titular
      AND c.archived_at IS NULL
      AND c.barbearia_id = ANY(_barbearia_ids_autor)
      AND public.whatsapp_match_digits(c.whatsapp, _digits)
  ) THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  SELECT c.id
  INTO _cliente_id
  FROM public.clientes c
  WHERE c.titular_user_id = _titular
    AND c.archived_at IS NULL
    AND public.whatsapp_match_digits(c.whatsapp, _digits)
  ORDER BY c.updated_at DESC
  LIMIT 1;

  IF _cliente_id IS NOT NULL THEN
    UPDATE public.clientes
    SET avatar_url = _avatar, updated_at = now()
    WHERE id = _cliente_id;
    _updated := 1;
  ELSE
    SELECT a.barbearia_id, a.cliente_nome
    INTO _barbearia_id, _nome
    FROM public.agendamentos a
    WHERE a.titular_user_id = _titular
      AND a.archived_at IS NULL
      AND public.cliente_whatsapp_digits(a.cliente_whatsapp) = _digits
    ORDER BY a.data DESC, a.hora DESC
    LIMIT 1;

    IF _barbearia_id IS NULL THEN
      _barbearia_id := _barbearia_ids_autor[1];
      _nome := 'Cliente';
    END IF;

    INSERT INTO public.clientes (barbearia_id, nome, whatsapp, avatar_url, titular_user_id)
    VALUES (_barbearia_id, _nome, _digits, _avatar, _titular);
    _updated := 1;
  END IF;

  RETURN json_build_object(
    'ok', true,
    'whatsapp_digits', _digits,
    'avatar_url', _avatar,
    'updated_clientes', _updated
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_paciente_avatar_painel(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_paciente_nome_painel(
  p_whatsapp_digits text,
  p_nome text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _titular uuid := public.painel_titular_user_id();
  _digits text;
  _nome text;
  _barbearia_ids_autor uuid[];
  _cliente_id uuid;
  _barbearia_id uuid;
  _fallback_nome text;
  _updated_clientes int;
  _updated_agendamentos int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  _digits := public.cliente_whatsapp_digits(p_whatsapp_digits);
  IF length(_digits) < 10 THEN
    RETURN json_build_object('error', 'invalid_whatsapp');
  END IF;

  _nome := trim(COALESCE(p_nome, ''));
  IF length(_nome) = 0 OR length(_nome) > 120 THEN
    RETURN json_build_object('error', 'invalid_name');
  END IF;

  _barbearia_ids_autor := public.painel_barbearia_ids_editaveis();

  IF coalesce(array_length(_barbearia_ids_autor, 1), 0) = 0 THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.agendamentos a
    WHERE a.titular_user_id = _titular
      AND a.archived_at IS NULL
      AND a.barbearia_id = ANY(_barbearia_ids_autor)
      AND public.cliente_whatsapp_digits(a.cliente_whatsapp) = _digits
      AND (
        a.status = 'concluido'::public.agendamento_status
        OR EXISTS (
          SELECT 1
          FROM public.agendamento_anotacoes an
          WHERE an.agendamento_id = a.id
            AND an.archived_at IS NULL
        )
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.clientes c
    WHERE c.titular_user_id = _titular
      AND c.archived_at IS NULL
      AND c.barbearia_id = ANY(_barbearia_ids_autor)
      AND public.whatsapp_match_digits(c.whatsapp, _digits)
  ) THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  SELECT c.id
  INTO _cliente_id
  FROM public.clientes c
  WHERE c.titular_user_id = _titular
    AND c.archived_at IS NULL
    AND public.whatsapp_match_digits(c.whatsapp, _digits)
  ORDER BY c.updated_at DESC
  LIMIT 1;

  IF _cliente_id IS NOT NULL THEN
    UPDATE public.clientes
    SET nome = _nome, updated_at = now()
    WHERE id = _cliente_id;
    _updated_clientes := 1;
  ELSE
    SELECT a.barbearia_id, a.cliente_nome
    INTO _barbearia_id, _fallback_nome
    FROM public.agendamentos a
    WHERE a.titular_user_id = _titular
      AND a.archived_at IS NULL
      AND public.cliente_whatsapp_digits(a.cliente_whatsapp) = _digits
    ORDER BY a.data DESC, a.hora DESC
    LIMIT 1;

    IF _barbearia_id IS NULL THEN
      _barbearia_id := _barbearia_ids_autor[1];
      _fallback_nome := 'Cliente';
    END IF;

    INSERT INTO public.clientes (barbearia_id, nome, whatsapp, titular_user_id)
    VALUES (_barbearia_id, _nome, _digits, _titular)
    RETURNING id INTO _cliente_id;
    _updated_clientes := 1;
  END IF;

  UPDATE public.agendamentos a
  SET cliente_nome = _nome
  WHERE a.titular_user_id = _titular
    AND a.archived_at IS NULL
    AND public.cliente_whatsapp_digits(a.cliente_whatsapp) = _digits;

  GET DIAGNOSTICS _updated_agendamentos = ROW_COUNT;

  UPDATE public.agendamentos a
  SET cliente_id = c.id
  FROM public.clientes c
  WHERE a.titular_user_id = _titular
    AND a.archived_at IS NULL
    AND c.titular_user_id = _titular
    AND c.archived_at IS NULL
    AND public.cliente_whatsapp_digits(a.cliente_whatsapp) = _digits
    AND public.whatsapp_match_digits(c.whatsapp, _digits)
    AND a.cliente_id IS NULL;

  RETURN json_build_object(
    'ok', true,
    'nome', _nome,
    'whatsapp_digits', _digits,
    'updated_clientes', _updated_clientes,
    'updated_agendamentos', _updated_agendamentos
  );
END;
$$;

COMMENT ON FUNCTION public.update_paciente_nome_painel(text, text) IS
  'Renomeia paciente por WhatsApp na família CT+CA. Só CA/CT própria pode iniciar; nome propaga para toda a família.';

GRANT EXECUTE ON FUNCTION public.update_paciente_nome_painel(text, text) TO authenticated;

-- migration: 20260721162830_rpc_anotacoes_titular.sql
-- Fase H onda 2: RPCs anotações — escopo titular_user_id + archived_at IS NULL.

CREATE OR REPLACE FUNCTION public.painel_pode_escrever_anotacao(p_agendamento_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agendamentos a
    JOIN public.barbearias b ON b.id = a.barbearia_id
    JOIN public.barbershops shop ON shop.slug = b.slug
    JOIN public.barbeiros br ON br.id = a.barbeiro_id
    JOIN public.barbearias prof_b ON prof_b.id = br.barbearia_id
    JOIN public.barbershops prof_shop ON prof_shop.slug = prof_b.slug
    WHERE a.id = p_agendamento_id
      AND a.status = 'concluido'::public.agendamento_status
      AND a.archived_at IS NULL
      AND a.titular_user_id = public.painel_titular_user_id()
      AND shop.owner_id = auth.uid()
      AND prof_shop.owner_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.agendamentos a
    WHERE a.id = p_agendamento_id
      AND a.status = 'concluido'::public.agendamento_status
      AND a.archived_at IS NULL
      AND a.barbearia_id IS NULL
      AND a.titular_user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.painel_pode_escrever_anotacao(uuid) IS
  'Escrita de anotação: dono direto da barbearia do agendamento e do profissional. Titular nunca escreve em atendimento CA.';

GRANT EXECUTE ON FUNCTION public.painel_pode_escrever_anotacao(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.painel_titular_pode_ver_conteudo_anotacao_ca(p_agendamento_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agendamentos a
    JOIN public.barbearias ag_bb ON ag_bb.id = a.barbearia_id
    JOIN public.barbershops ag_shop ON ag_shop.slug = ag_bb.slug
    JOIN public.aggregated_accounts aa
      ON aa.aggregated_user_id = ag_shop.owner_id
     AND aa.status = 'active'::public.aggregated_account_status
    WHERE a.id = p_agendamento_id
      AND a.titular_user_id = public.painel_titular_user_id()
      AND a.archived_at IS NULL
      AND aa.owner_user_id = auth.uid()
      AND aa.owner_can_view_annotations = true
      AND ag_shop.owner_id IS DISTINCT FROM auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.agendamentos a
    JOIN public.barbeiros br ON br.id = a.barbeiro_id
    JOIN public.barbearias prof_bb ON prof_bb.id = br.barbearia_id
    JOIN public.barbershops prof_shop ON prof_shop.slug = prof_bb.slug
    JOIN public.aggregated_accounts aa
      ON aa.aggregated_user_id = prof_shop.owner_id
     AND aa.status = 'active'::public.aggregated_account_status
    WHERE a.id = p_agendamento_id
      AND a.titular_user_id = public.painel_titular_user_id()
      AND a.archived_at IS NULL
      AND aa.owner_user_id = auth.uid()
      AND aa.owner_can_view_annotations = true
      AND prof_shop.owner_id IS DISTINCT FROM auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.painel_titular_pode_ver_conteudo_anotacao_ca(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.painel_pode_ler_conteudo_anotacao(p_agendamento_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agendamentos a
    JOIN public.barbearias b ON b.id = a.barbearia_id
    JOIN public.barbershops s ON s.slug = b.slug
    WHERE a.id = p_agendamento_id
      AND a.titular_user_id = public.painel_titular_user_id()
      AND a.archived_at IS NULL
      AND s.owner_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.agendamentos a
    WHERE a.id = p_agendamento_id
      AND a.archived_at IS NULL
      AND a.barbearia_id IS NULL
      AND a.titular_user_id = auth.uid()
  )
  OR (
    public.painel_agendamento_e_de_ca_agregada(p_agendamento_id)
    AND public.painel_titular_pode_ver_conteudo_anotacao_ca(p_agendamento_id)
  );
$$;

COMMENT ON FUNCTION public.painel_pode_ler_conteudo_anotacao(uuid) IS
  'Conteúdo textual da anotação: dono da barbearia ou titular com toggle de anotações da CA.';

GRANT EXECUTE ON FUNCTION public.painel_pode_ler_conteudo_anotacao(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.painel_pode_ler_anotacao(p_agendamento_id uuid)
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
      AND a.titular_user_id = public.painel_titular_user_id()
      AND a.archived_at IS NULL
      AND (
        public.painel_agendamento_visivel_pacientes(
          a.barbearia_id,
          a.barbeiro_id,
          public.painel_barbearia_ids_pacientes_visiveis()
        )
        OR (a.barbearia_id IS NULL AND a.titular_user_id = auth.uid())
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.painel_pode_ler_anotacao(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_agendamento_anotacao(p_agendamento_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row record;
  _pode_ler_conteudo boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF NOT public.painel_pode_ler_anotacao(p_agendamento_id) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  _pode_ler_conteudo := public.painel_pode_ler_conteudo_anotacao(p_agendamento_id);

  SELECT
    an.id,
    an.conteudo,
    an.updated_at,
    public.painel_pode_escrever_anotacao(p_agendamento_id) AS can_write
  INTO _row
  FROM public.agendamento_anotacoes an
  WHERE an.agendamento_id = p_agendamento_id
    AND an.archived_at IS NULL;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'conteudo', '',
      'can_write', public.painel_pode_escrever_anotacao(p_agendamento_id)
    );
  END IF;

  RETURN json_build_object(
    'id', _row.id,
    'conteudo', CASE WHEN _pode_ler_conteudo THEN _row.conteudo ELSE '' END,
    'updated_at', _row.updated_at,
    'can_write', _row.can_write
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_agendamento_anotacao(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_agendamento_anotacao(
  p_agendamento_id uuid,
  p_conteudo text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _conteudo text;
  _row record;
  _titular uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF NOT public.painel_pode_escrever_anotacao(p_agendamento_id) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  SELECT a.titular_user_id
  INTO _titular
  FROM public.agendamentos a
  WHERE a.id = p_agendamento_id
    AND a.archived_at IS NULL;

  IF _titular IS NULL THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  _conteudo := trim(COALESCE(p_conteudo, ''));

  INSERT INTO public.agendamento_anotacoes (agendamento_id, conteudo, created_by, titular_user_id)
  VALUES (p_agendamento_id, _conteudo, auth.uid(), _titular)
  ON CONFLICT (agendamento_id)
  DO UPDATE SET
    conteudo = EXCLUDED.conteudo,
    updated_at = now()
  WHERE public.agendamento_anotacoes.archived_at IS NULL
  RETURNING id, conteudo, updated_at INTO _row;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  RETURN json_build_object(
    'ok', true,
    'id', _row.id,
    'conteudo', _row.conteudo,
    'updated_at', _row.updated_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_agendamento_anotacao(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_paciente_anotacoes(
  p_whatsapp_digits text,
  p_barbeiro_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _titular uuid := public.painel_titular_user_id();
  _barbearia_ids uuid[];
  _digits text;
  _items json;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  _digits := public.cliente_whatsapp_digits(p_whatsapp_digits);
  IF length(_digits) < 10 THEN
    RETURN json_build_object('error', 'invalid_whatsapp');
  END IF;

  _barbearia_ids := public.painel_barbearia_ids_pacientes_visiveis();

  SELECT coalesce(json_agg(row_to_json(x) ORDER BY x.data DESC, x.hora DESC), '[]'::json)
  INTO _items
  FROM (
    SELECT
      a.id AS agendamento_id,
      a.data,
      a.hora,
      public.cliente_nome_exibicao(a.barbearia_id, a.cliente_id, a.cliente_whatsapp, a.cliente_nome) AS cliente_nome,
      a.cliente_whatsapp,
      a.barbearia_id,
      a.status,
      bb.nome AS barbeiro_nome,
      to_jsonb(coalesce(a.servicos_nomes, ARRAY[]::text[])) AS servicos_nomes,
      CASE
        WHEN public.painel_pode_ler_conteudo_anotacao(a.id) THEN an.conteudo
        ELSE NULL
      END AS anotacao_conteudo,
      an.updated_at AS anotacao_updated_at,
      public.painel_pode_escrever_anotacao(a.id) AS can_write
    FROM public.agendamentos a
    JOIN public.barbeiros bb ON bb.id = a.barbeiro_id
    LEFT JOIN public.agendamento_anotacoes an
      ON an.agendamento_id = a.id
     AND an.archived_at IS NULL
    WHERE a.titular_user_id = _titular
      AND a.archived_at IS NULL
      AND (
        public.painel_agendamento_visivel_pacientes(a.barbearia_id, a.barbeiro_id, _barbearia_ids)
        OR (a.barbearia_id IS NULL AND a.titular_user_id = _titular)
      )
      AND public.cliente_whatsapp_digits(a.cliente_whatsapp) = _digits
      AND (p_barbeiro_id IS NULL OR a.barbeiro_id = p_barbeiro_id)
      AND (
        a.status = 'concluido'::public.agendamento_status
        OR an.id IS NOT NULL
      )
  ) x;

  RETURN json_build_object('items', _items);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_paciente_anotacoes(text, uuid) TO authenticated;

-- migration: 20260721162840_rpc_documentos_titular.sql
-- Fase H onda 2: RPCs documentos — escopo titular_user_id + archived_at IS NULL.

CREATE OR REPLACE FUNCTION public.painel_paciente_documentos_visivel(p_whatsapp_digits text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND length(public.cliente_whatsapp_digits(p_whatsapp_digits)) >= 10
    AND EXISTS (
      SELECT 1
      FROM public.agendamentos a
      WHERE a.titular_user_id = public.painel_titular_user_id()
        AND a.archived_at IS NULL
        AND public.cliente_whatsapp_digits(a.cliente_whatsapp) = public.cliente_whatsapp_digits(p_whatsapp_digits)
        AND (
          a.status = 'concluido'::public.agendamento_status
          OR EXISTS (
            SELECT 1
            FROM public.agendamento_anotacoes an
            WHERE an.agendamento_id = a.id
              AND an.archived_at IS NULL
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.painel_pode_upload_documento_paciente(p_whatsapp_digits text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND length(public.cliente_whatsapp_digits(p_whatsapp_digits)) >= 10
    AND EXISTS (
      SELECT 1
      FROM public.agendamentos a
      WHERE a.titular_user_id = public.painel_titular_user_id()
        AND a.archived_at IS NULL
        AND public.cliente_whatsapp_digits(a.cliente_whatsapp) = public.cliente_whatsapp_digits(p_whatsapp_digits)
        AND (
          a.status = 'concluido'::public.agendamento_status
          OR EXISTS (
            SELECT 1
            FROM public.agendamento_anotacoes an
            WHERE an.agendamento_id = a.id
              AND an.archived_at IS NULL
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.list_paciente_documentos(p_whatsapp_digits text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _digits text;
  _items json;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  _digits := public.cliente_whatsapp_digits(p_whatsapp_digits);
  IF length(_digits) < 10 THEN
    RETURN json_build_object('error', 'invalid_whatsapp');
  END IF;

  IF NOT public.painel_paciente_documentos_visivel(_digits) THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  SELECT coalesce(json_agg(row_to_json(d) ORDER BY d.created_at DESC), '[]'::json)
  INTO _items
  FROM (
    SELECT
      pd.id,
      pd.file_name,
      pd.mime_type,
      pd.size_bytes,
      pd.storage_path,
      pd.created_at,
      (pd.uploaded_by = auth.uid()) AS can_delete
    FROM public.paciente_documentos pd
    WHERE pd.whatsapp_digits = _digits
      AND pd.titular_user_id = public.painel_titular_user_id()
      AND pd.archived_at IS NULL
  ) d;

  RETURN json_build_object('documentos', _items);
END;
$$;

CREATE OR REPLACE FUNCTION public.register_paciente_documento_painel(
  p_whatsapp_digits text,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _digits text;
  _barbearia_id uuid;
  _path text;
  _name text;
  _mime text;
  _doc_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  _digits := public.cliente_whatsapp_digits(p_whatsapp_digits);
  IF length(_digits) < 10 THEN
    RETURN json_build_object('error', 'invalid_whatsapp');
  END IF;

  IF NOT public.painel_pode_upload_documento_paciente(_digits) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  _path := trim(coalesce(p_storage_path, ''));
  IF _path = '' OR length(_path) > 1024 THEN
    RETURN json_build_object('error', 'invalid_storage_path');
  END IF;

  IF split_part(_path, '/', 1) <> auth.uid()::text THEN
    RETURN json_build_object('error', 'invalid_storage_path');
  END IF;

  _name := trim(coalesce(p_file_name, ''));
  IF _name = '' OR length(_name) > 255 THEN
    RETURN json_build_object('error', 'invalid_file_name');
  END IF;

  _mime := trim(coalesce(p_mime_type, ''));
  IF _mime NOT IN (
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/pdf',
    'image/jpeg'
  ) THEN
    RETURN json_build_object('error', 'invalid_mime_type', 'message', 'Formato de arquivo não suportado.');
  END IF;

  IF p_size_bytes IS NULL OR p_size_bytes <= 0 OR p_size_bytes > 10485760 THEN
    RETURN json_build_object('error', 'file_too_large', 'message', 'O arquivo excede o limite de 10 MB.');
  END IF;

  SELECT a.barbearia_id
  INTO _barbearia_id
  FROM public.agendamentos a
  WHERE a.titular_user_id = public.painel_titular_user_id()
    AND a.archived_at IS NULL
    AND public.cliente_whatsapp_digits(a.cliente_whatsapp) = _digits
    AND (
      a.status = 'concluido'::public.agendamento_status
      OR EXISTS (
        SELECT 1
        FROM public.agendamento_anotacoes an
        WHERE an.agendamento_id = a.id
          AND an.archived_at IS NULL
      )
    )
  ORDER BY a.data DESC, a.hora DESC
  LIMIT 1;

  INSERT INTO public.paciente_documentos (
    whatsapp_digits,
    barbearia_id,
    storage_path,
    file_name,
    mime_type,
    size_bytes,
    uploaded_by,
    titular_user_id
  )
  VALUES (
    _digits,
    _barbearia_id,
    _path,
    _name,
    _mime,
    p_size_bytes,
    auth.uid(),
    public.painel_titular_user_id()
  )
  RETURNING id INTO _doc_id;

  RETURN json_build_object(
    'ok', true,
    'id', _doc_id,
    'storage_path', _path,
    'file_name', _name,
    'mime_type', _mime,
    'size_bytes', p_size_bytes
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_paciente_documento_painel(p_documento_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.paciente_documentos%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  SELECT *
  INTO _row
  FROM public.paciente_documentos pd
  WHERE pd.id = p_documento_id
    AND pd.uploaded_by = auth.uid()
    AND pd.titular_user_id = public.painel_titular_user_id()
    AND pd.archived_at IS NULL;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  DELETE FROM public.paciente_documentos WHERE id = _row.id;

  RETURN json_build_object(
    'ok', true,
    'storage_path', _row.storage_path
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_paciente_documentos(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_paciente_documento_painel(text, text, text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_paciente_documento_painel(uuid) TO authenticated;

-- migration: 20260721162850_rpc_agendamentos_painel_titular.sql
-- Fase H onda 2: get_agendamentos_painel — escopo titular_user_id + archived_at IS NULL.

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
  _titular                          uuid := public.painel_titular_user_id();
  _barbearia_ids                    uuid[];
  _barbearia_ids_agendamentos_edit  uuid[];
  _items                            json;
  _profissionais                    json;
  _total                            int;
  _confirmados                      int;
  _concluidos                       int;
  _aguardando                       int;
  _aguardando_pagamento             int;
  _cancelados                       int;
  _faturamento                      bigint;
  _status_visiveis                  public.agendamento_status[] := ARRAY[
    'confirmado'::public.agendamento_status,
    'concluido'::public.agendamento_status,
    'cancelado'::public.agendamento_status,
    'nao_veio'::public.agendamento_status,
    'aguardando_pagamento'::public.agendamento_status
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
        'aguardando_pagamento', 0,
        'cancelados', 0,
        'faturamento_centavos', 0
      )
    );
  END IF;

  PERFORM public.expirar_agendamentos_nao_confirmados(_barbearia_ids);
  PERFORM public.expirar_agendamentos_aguardando_pagamento();

  SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.data, t.hora, t.barbeiro_nome), '[]'::json)
  INTO _items
  FROM (
    SELECT
      a.id,
      a.data,
      to_char(a.hora, 'HH24:MI') AS hora,
      public.cliente_nome_exibicao(a.barbearia_id, a.cliente_id, a.cliente_whatsapp, a.cliente_nome) AS cliente_nome,
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
      a.valor_base_centavos,
      a.valor_pago_centavos,
      a.valor_restante_centavos,
      a.payment_expires_at,
      a.payment_status::text AS payment_status,
      CASE
        WHEN a.barbearia_id IS NULL THEN
          a.titular_user_id = _titular AND auth.uid() = _titular
        ELSE
          a.barbearia_id = ANY(_barbearia_ids_agendamentos_edit)
      END AS can_manage,
      EXISTS (
        SELECT 1 FROM public.alertas_agendamento al
        WHERE al.agendamento_id = a.id AND al.status = 'pendente'
      ) AS has_pending_alert
    FROM public.agendamentos a
    LEFT JOIN public.barbeiros br ON br.id = a.barbeiro_id
    WHERE a.titular_user_id = _titular
      AND a.archived_at IS NULL
      AND a.data BETWEEN p_data_inicio AND p_data_fim
      AND a.status = ANY(_status_visiveis)
      AND (
        a.status <> 'aguardando_pagamento'::public.agendamento_status
        OR public.public_booking_hold_blocks_slot(a)
      )
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
    WHERE a.titular_user_id = _titular
      AND a.archived_at IS NULL
      AND a.data BETWEEN p_data_inicio AND p_data_fim
      AND a.status = ANY(_status_visiveis)
      AND (
        a.status <> 'aguardando_pagamento'::public.agendamento_status
        OR public.public_booking_hold_blocks_slot(a)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.barbeiros bx
        WHERE bx.id = a.barbeiro_id AND bx.ativo = true
      )
  ) p;

  SELECT count(*)::int INTO _total
  FROM public.agendamentos a
  WHERE a.titular_user_id = _titular
    AND a.archived_at IS NULL
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = ANY(_status_visiveis)
    AND (
      a.status <> 'aguardando_pagamento'::public.agendamento_status
      OR public.public_booking_hold_blocks_slot(a)
    );

  SELECT count(*)::int INTO _confirmados
  FROM public.agendamentos a
  WHERE a.titular_user_id = _titular
    AND a.archived_at IS NULL
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'confirmado'::public.agendamento_status
    AND (
      NOT coalesce(a.requires_client_confirmation, false)
      OR a.client_confirmed_at IS NOT NULL
    );

  SELECT count(*)::int INTO _concluidos
  FROM public.agendamentos a
  WHERE a.titular_user_id = _titular
    AND a.archived_at IS NULL
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'concluido'::public.agendamento_status;

  SELECT count(*)::int INTO _aguardando
  FROM public.agendamentos a
  WHERE a.titular_user_id = _titular
    AND a.archived_at IS NULL
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'confirmado'::public.agendamento_status
    AND coalesce(a.requires_client_confirmation, false)
    AND a.client_confirmed_at IS NULL;

  SELECT count(*)::int INTO _aguardando_pagamento
  FROM public.agendamentos a
  WHERE a.titular_user_id = _titular
    AND a.archived_at IS NULL
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'aguardando_pagamento'::public.agendamento_status
    AND public.public_booking_hold_blocks_slot(a);

  SELECT count(*)::int INTO _cancelados
  FROM public.agendamentos a
  WHERE a.titular_user_id = _titular
    AND a.archived_at IS NULL
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
  WHERE a.titular_user_id = _titular
    AND a.archived_at IS NULL
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
      'aguardando_pagamento', _aguardando_pagamento,
      'cancelados', _cancelados,
      'faturamento_centavos', _faturamento
    )
  );
END;
$$;

COMMENT ON FUNCTION public.get_agendamentos_painel(date, date) IS
  'Painel Agendamentos: escopo titular_user_id + archived_at IS NULL; can_manage híbrido para órfãos (barbearia_id NULL).';

GRANT EXECUTE ON FUNCTION public.get_agendamentos_painel(date, date) TO authenticated;

-- migration: 20260721162860_rpc_relatorios_titular.sql
-- Fase H onda 2: relatórios — escopo titular_user_id + archived_at IS NULL.

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

  IF coalesce(array_length(_barbearia_ids, 1), 0) > 0 THEN
    PERFORM public.expirar_agendamentos_nao_confirmados(_barbearia_ids);
  END IF;

  SELECT count(*)::int
  INTO _total
  FROM public.agendamentos a
  WHERE a.titular_user_id = public.painel_titular_user_id()
    AND a.archived_at IS NULL
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'concluido'::public.agendamento_status;

  SELECT count(*)::int
  INTO _total_faltas
  FROM public.agendamentos a
  WHERE a.titular_user_id = public.painel_titular_user_id()
    AND a.archived_at IS NULL
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'nao_veio'::public.agendamento_status;

  SELECT count(*)::int
  INTO _total_cancel
  FROM public.agendamentos a
  WHERE a.titular_user_id = public.painel_titular_user_id()
    AND a.archived_at IS NULL
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
  WHERE a.titular_user_id = public.painel_titular_user_id()
    AND a.archived_at IS NULL
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'concluido'::public.agendamento_status;

  IF coalesce(array_length(_barbearia_ids, 1), 0) > 0 THEN
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
       AND a.titular_user_id = public.painel_titular_user_id()
       AND a.archived_at IS NULL
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
  ELSE
    _por_barbeiro := '[]'::json;
  END IF;

  RETURN json_build_object(
    'total', _total,
    'total_faltas', _total_faltas,
    'total_cancelamentos', _total_cancel,
    'faturamento_total_centavos', _faturamento,
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

  IF coalesce(array_length(_barbearia_ids, 1), 0) > 0 THEN
    PERFORM public.expirar_agendamentos_nao_confirmados(_barbearia_ids);
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1
      FROM public.barbeiros br
      WHERE br.id = p_barbeiro_id
        AND br.barbearia_id = ANY(_barbearia_ids)
    )
    OR EXISTS (
      SELECT 1
      FROM public.agendamentos a
      WHERE a.barbeiro_id = p_barbeiro_id
        AND a.titular_user_id = public.painel_titular_user_id()
        AND a.archived_at IS NULL
        AND a.barbearia_id IS NULL
        AND a.titular_user_id = auth.uid()
    )
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
    AND a.titular_user_id = public.painel_titular_user_id()
    AND a.archived_at IS NULL
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
      AND a.titular_user_id = public.painel_titular_user_id()
      AND a.archived_at IS NULL
      AND a.data BETWEEN p_data_inicio AND p_data_fim
      AND a.status = 'concluido'::public.agendamento_status
  ) t;

  SELECT count(*)::int
  INTO _faltas_total
  FROM public.agendamentos a
  WHERE a.barbeiro_id = p_barbeiro_id
    AND a.titular_user_id = public.painel_titular_user_id()
    AND a.archived_at IS NULL
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
      AND a.titular_user_id = public.painel_titular_user_id()
      AND a.archived_at IS NULL
      AND a.data BETWEEN p_data_inicio AND p_data_fim
      AND a.status = 'nao_veio'::public.agendamento_status
  ) t;

  SELECT count(*)::int
  INTO _cancelamentos_total
  FROM public.agendamentos a
  WHERE a.barbeiro_id = p_barbeiro_id
    AND a.titular_user_id = public.painel_titular_user_id()
    AND a.archived_at IS NULL
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
      AND a.titular_user_id = public.painel_titular_user_id()
      AND a.archived_at IS NULL
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
  'Resumo de agendamentos concluídos, faltas e cancelamentos por período — escopo titular_user_id + archived_at IS NULL.';

COMMENT ON FUNCTION public.get_relatorio_detalhes_colaborador(date, date, uuid) IS
  'Detalhe do relatório por colaborador (concluídos, faltas, cancelamentos) — escopo titular_user_id + archived_at IS NULL.';

GRANT EXECUTE ON FUNCTION public.get_relatorio_agendamentos(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_relatorio_detalhes_colaborador(date, date, uuid) TO authenticated;

-- migration: 20260721162870_extension_connect_titular.sql
-- Fase H onda 2: Extension Connect — escopo titular_user_id + archived_at IS NULL.

CREATE OR REPLACE FUNCTION public.painel_titular_user_id_for_user(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT aa.owner_user_id
      FROM public.aggregated_accounts aa
      WHERE aa.aggregated_user_id = p_user_id
        AND aa.status = 'active'::public.aggregated_account_status
      LIMIT 1
    ),
    p_user_id
  );
$$;

COMMENT ON FUNCTION public.painel_titular_user_id_for_user(uuid) IS
  'Titular clínico (CT) para um user_id arbitrário: owner_user_id se CA agregada ativa, senão o próprio user_id.';

CREATE OR REPLACE FUNCTION public.extension_connect_pode_ler_conteudo_anotacao(
  p_agendamento_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agendamentos a
    LEFT JOIN public.barbearias b ON b.id = a.barbearia_id
    LEFT JOIN public.barbershops s ON s.slug = b.slug
    WHERE a.id = p_agendamento_id
      AND (
        s.owner_id = p_user_id
        OR (
          a.barbearia_id IS NULL
          AND a.titular_user_id = public.painel_titular_user_id_for_user(p_user_id)
        )
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.agendamentos a
    LEFT JOIN public.barbearias ag_bb ON ag_bb.id = a.barbearia_id
    LEFT JOIN public.barbershops ag_shop ON ag_shop.slug = ag_bb.slug
    JOIN public.aggregated_accounts aa
      ON aa.aggregated_user_id = ag_shop.owner_id
     AND aa.status = 'active'::public.aggregated_account_status
    WHERE a.id = p_agendamento_id
      AND ag_shop.owner_id IS NOT NULL
      AND aa.owner_user_id = p_user_id
      AND aa.owner_can_view_annotations = true
      AND ag_shop.owner_id IS DISTINCT FROM p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.extension_connect_client_lookup(
  p_user_id uuid,
  p_phone text,
  p_display_name text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _digits text;
  _titular uuid;
  _nome text;
  _avatar text;
  _clinica text;
  _history json;
  _history_total int;
  _next_appointment json;
  _today date;
  _now_time time;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN json_build_object('error', 'invalid_user');
  END IF;

  _digits := public.cliente_whatsapp_digits(p_phone);
  IF length(_digits) < 10 OR length(_digits) > 13 THEN
    RETURN json_build_object('error', 'invalid_phone', 'phone_digits', _digits);
  END IF;

  _titular := public.painel_titular_user_id_for_user(p_user_id);
  _clinica := public.extension_connect_clinic_display_name(p_user_id);
  _today := (timezone('America/Sao_Paulo', now()))::date;
  _now_time := (timezone('America/Sao_Paulo', now()))::time;

  SELECT coalesce(
    (
      SELECT c.nome
      FROM public.clientes c
      WHERE c.titular_user_id = _titular
        AND c.archived_at IS NULL
        AND public.whatsapp_match_digits(c.whatsapp, _digits)
      ORDER BY c.updated_at DESC
      LIMIT 1
    ),
    (
      SELECT a.cliente_nome
      FROM public.agendamentos a
      WHERE a.titular_user_id = _titular
        AND a.archived_at IS NULL
        AND public.whatsapp_match_digits(a.cliente_whatsapp, _digits)
      ORDER BY a.data DESC, a.hora DESC
      LIMIT 1
    ),
    nullif(trim(p_display_name), ''),
    'Paciente'
  )
  INTO _nome;

  SELECT c.avatar_url
  INTO _avatar
  FROM public.clientes c
  WHERE c.titular_user_id = _titular
    AND c.archived_at IS NULL
    AND public.whatsapp_match_digits(c.whatsapp, _digits)
  ORDER BY (c.avatar_url IS NOT NULL AND trim(c.avatar_url) <> '') DESC, c.updated_at DESC
  LIMIT 1;

  IF _avatar IS NOT NULL AND trim(_avatar) = '' THEN
    _avatar := NULL;
  END IF;

  SELECT row_to_json(n)
  INTO _next_appointment
  FROM (
    SELECT
      a.id AS agendamento_id,
      a.data,
      to_char(a.hora, 'HH24:MI') AS hora,
      a.duracao_minutos,
      coalesce(bb.slot_minutos, 30) AS slot_minutos,
      bb.nome AS barbeiro_nome
    FROM public.agendamentos a
    JOIN public.barbeiros bb ON bb.id = a.barbeiro_id
    WHERE a.titular_user_id = _titular
      AND a.archived_at IS NULL
      AND public.whatsapp_match_digits(a.cliente_whatsapp, _digits)
      AND a.status IN (
        'confirmado'::public.agendamento_status,
        'aguardando_pagamento'::public.agendamento_status
      )
      AND (
        a.data > _today
        OR (a.data = _today AND a.hora >= _now_time)
      )
    ORDER BY a.data ASC, a.hora ASC
    LIMIT 1
  ) n;

  SELECT coalesce(json_agg(row_to_json(x) ORDER BY x.data DESC, x.hora DESC), '[]'::json)
  INTO _history
  FROM (
    SELECT
      a.id AS agendamento_id,
      a.data,
      to_char(a.hora, 'HH24:MI') AS hora,
      a.duracao_minutos,
      coalesce(bb.slot_minutos, 30) AS slot_minutos,
      bb.nome AS barbeiro_nome,
      to_jsonb(coalesce(a.servicos_nomes, ARRAY[]::text[])) AS servicos_nomes,
      CASE
        WHEN public.extension_connect_pode_ler_conteudo_anotacao(a.id, p_user_id) THEN an.conteudo
        ELSE NULL
      END AS anotacao_conteudo
    FROM public.agendamentos a
    JOIN public.barbeiros bb ON bb.id = a.barbeiro_id
    LEFT JOIN public.agendamento_anotacoes an
      ON an.agendamento_id = a.id
     AND an.archived_at IS NULL
    WHERE a.titular_user_id = _titular
      AND a.archived_at IS NULL
      AND public.whatsapp_match_digits(a.cliente_whatsapp, _digits)
      AND (
        a.status = 'concluido'::public.agendamento_status
        OR an.id IS NOT NULL
      )
  ) x;

  _history_total := coalesce(json_array_length(_history), 0);

  RETURN json_build_object(
    'phone_digits', _digits,
    'clinic_display_name', _clinica,
    'next_appointment', _next_appointment,
    'patient', json_build_object(
      'nome', _nome,
      'avatar_url', _avatar,
      'whatsapp_digits', _digits
    ),
    'history', _history,
    'history_total', _history_total,
    'history_has_more', _history_total > 4
  );
END;
$$;

COMMENT ON FUNCTION public.extension_connect_client_lookup(uuid, text, text) IS
  'Painel Connect: paciente, histórico, próximo agendamento (variável %agendamento%). Escopo titular_user_id + archived_at IS NULL.';

GRANT EXECUTE ON FUNCTION public.painel_titular_user_id_for_user(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.extension_connect_pode_ler_conteudo_anotacao(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.extension_connect_client_lookup(uuid, text, text) TO service_role;

-- migration: 20260721162880_clinical_refresh_activity_titular.sql
-- Fase H onda 2: D2 retenção — documentos por titular_user_id, não barbearia_id.

CREATE OR REPLACE FUNCTION public.compute_cliente_last_clinical_activity_at(p_cliente_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT NULLIF(
    GREATEST(
      COALESCE((
        SELECT MAX(GREATEST(an.created_at, an.updated_at))
        FROM public.agendamento_anotacoes an
        INNER JOIN public.agendamentos a ON a.id = an.agendamento_id
        WHERE a.cliente_id = p_cliente_id
      ), '-infinity'::timestamptz),
      COALESCE((
        SELECT MAX((a.data + a.hora) AT TIME ZONE 'America/Sao_Paulo')
        FROM public.agendamentos a
        WHERE a.cliente_id = p_cliente_id
          AND a.status = 'concluido'::public.agendamento_status
      ), '-infinity'::timestamptz),
      COALESCE((
        SELECT MAX(pd.created_at)
        FROM public.paciente_documentos pd
        INNER JOIN public.clientes c ON c.id = p_cliente_id
        WHERE pd.titular_user_id = c.titular_user_id
          AND pd.whatsapp_digits = public.cliente_whatsapp_digits(c.whatsapp)
      ), '-infinity'::timestamptz)
    ),
    '-infinity'::timestamptz
  );
$$;

COMMENT ON FUNCTION public.compute_cliente_last_clinical_activity_at(uuid) IS
  'Último instante clínico do paciente: MAX(anotação, slot concluído data+hora SP, documento). Inclui registros arquivados (retenção legal; visibilidade na UI é outra camada).';

CREATE OR REPLACE FUNCTION public.refresh_cliente_last_clinical_activity(p_cliente_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF p_cliente_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.clientes
  SET last_clinical_activity_at = public.compute_cliente_last_clinical_activity_at(p_cliente_id)
  WHERE id = p_cliente_id;
END;
$$;

COMMENT ON FUNCTION public.refresh_cliente_last_clinical_activity(uuid) IS
  'Atualiza last_clinical_activity_at (e retention_until gerado) para um cliente após mudança clínica.';

CREATE OR REPLACE FUNCTION public.trg_refresh_cliente_clinical_activity_from_agendamento()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.cliente_id IS NOT NULL THEN
      PERFORM public.refresh_cliente_last_clinical_activity(OLD.cliente_id);
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.cliente_id IS DISTINCT FROM NEW.cliente_id
    AND OLD.cliente_id IS NOT NULL
  THEN
    PERFORM public.refresh_cliente_last_clinical_activity(OLD.cliente_id);
  END IF;

  IF NEW.cliente_id IS NOT NULL THEN
    PERFORM public.refresh_cliente_last_clinical_activity(NEW.cliente_id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_cliente_clinical_activity_from_anotacao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _cliente_id uuid;
  _old_cliente_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT a.cliente_id INTO _cliente_id
    FROM public.agendamentos a
    WHERE a.id = OLD.agendamento_id;

    IF _cliente_id IS NOT NULL THEN
      PERFORM public.refresh_cliente_last_clinical_activity(_cliente_id);
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.agendamento_id IS DISTINCT FROM NEW.agendamento_id THEN
    SELECT a.cliente_id INTO _old_cliente_id
    FROM public.agendamentos a
    WHERE a.id = OLD.agendamento_id;

    IF _old_cliente_id IS NOT NULL THEN
      PERFORM public.refresh_cliente_last_clinical_activity(_old_cliente_id);
    END IF;
  END IF;

  SELECT a.cliente_id INTO _cliente_id
  FROM public.agendamentos a
  WHERE a.id = NEW.agendamento_id;

  IF _cliente_id IS NOT NULL THEN
    PERFORM public.refresh_cliente_last_clinical_activity(_cliente_id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_cliente_clinical_activity_from_documento()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _row record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    FOR _row IN
      SELECT c.id
      FROM public.clientes c
      WHERE c.titular_user_id = OLD.titular_user_id
        AND public.cliente_whatsapp_digits(c.whatsapp) = OLD.whatsapp_digits
    LOOP
      PERFORM public.refresh_cliente_last_clinical_activity(_row.id);
    END LOOP;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.titular_user_id IS DISTINCT FROM NEW.titular_user_id
      OR OLD.whatsapp_digits IS DISTINCT FROM NEW.whatsapp_digits
    THEN
      FOR _row IN
        SELECT c.id
        FROM public.clientes c
        WHERE c.titular_user_id = OLD.titular_user_id
          AND public.cliente_whatsapp_digits(c.whatsapp) = OLD.whatsapp_digits
      LOOP
        PERFORM public.refresh_cliente_last_clinical_activity(_row.id);
      END LOOP;
    END IF;
  END IF;

  FOR _row IN
    SELECT c.id
    FROM public.clientes c
    WHERE c.titular_user_id = NEW.titular_user_id
      AND public.cliente_whatsapp_digits(c.whatsapp) = NEW.whatsapp_digits
  LOOP
    PERFORM public.refresh_cliente_last_clinical_activity(_row.id);
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agendamentos_refresh_cliente_clinical_activity ON public.agendamentos;
CREATE TRIGGER trg_agendamentos_refresh_cliente_clinical_activity
  AFTER INSERT OR UPDATE OF status, data, hora, cliente_id, archived_at
  OR DELETE
  ON public.agendamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refresh_cliente_clinical_activity_from_agendamento();

DROP TRIGGER IF EXISTS trg_agendamento_anotacoes_refresh_cliente_clinical_activity ON public.agendamento_anotacoes;
CREATE TRIGGER trg_agendamento_anotacoes_refresh_cliente_clinical_activity
  AFTER INSERT OR UPDATE OF conteudo, created_at, updated_at, agendamento_id, archived_at
  OR DELETE
  ON public.agendamento_anotacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refresh_cliente_clinical_activity_from_anotacao();

DROP TRIGGER IF EXISTS trg_paciente_documentos_refresh_cliente_clinical_activity ON public.paciente_documentos;
CREATE TRIGGER trg_paciente_documentos_refresh_cliente_clinical_activity
  AFTER INSERT OR UPDATE OF created_at, barbearia_id, whatsapp_digits, archived_at
  OR DELETE
  ON public.paciente_documentos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refresh_cliente_clinical_activity_from_documento();

-- Onda 2 consolidated test runner
CREATE OR REPLACE FUNCTION pg_temp.run_onda2_tests(p_inject_orphan boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  _ct uuid := 'b31a6a89-55a8-431b-b0c4-764071270390';
  _ca uuid := 'eddba38d-fb2a-461c-997a-de91371cba65';
  _inicio date := (timezone('America/Sao_Paulo', now()) - interval '2 years')::date;
  _fim date := (timezone('America/Sao_Paulo', now()) + interval '1 year')::date;
  _orphan_id uuid := '780dde23-fe30-4025-aec7-c5cddd9eb680';
  _saved_barbearia uuid;
  _list jsonb;
  _agenda_ct jsonb;
  _agenda_ca jsonb;
  _rel jsonb;
  _baseline_total int;
  _baseline_faltas int;
  _baseline_cancel int;
  _ct_orphans jsonb;
  _ca_orphans jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', _ct::text, true);
  PERFORM set_config('role', 'authenticated', true);

  _list := public.list_pacientes_painel(NULL, NULL, 500, 0)::jsonb;
  _rel := public.get_relatorio_agendamentos(_inicio, _fim)::jsonb;

  SELECT
    count(*) FILTER (WHERE status = 'concluido'::public.agendamento_status),
    count(*) FILTER (WHERE status = 'nao_veio'::public.agendamento_status),
    count(*) FILTER (WHERE status = 'cancelado'::public.agendamento_status)
  INTO _baseline_total, _baseline_faltas, _baseline_cancel
  FROM public.agendamentos a
  WHERE a.titular_user_id = _ct
    AND a.archived_at IS NULL
    AND a.data BETWEEN _inicio AND _fim;

  IF p_inject_orphan THEN
    PERFORM set_config('role', 'postgres', true);
    SELECT a.barbearia_id INTO _saved_barbearia
    FROM public.agendamentos a WHERE a.id = _orphan_id;
    UPDATE public.agendamentos SET barbearia_id = NULL WHERE id = _orphan_id;
    PERFORM set_config('request.jwt.claim.sub', _ct::text, true);
    PERFORM set_config('role', 'authenticated', true);
  END IF;

  _agenda_ct := public.get_agendamentos_painel(_inicio, _fim)::jsonb;
  PERFORM set_config('request.jwt.claim.sub', _ca::text, true);
  _agenda_ca := public.get_agendamentos_painel(_inicio, _fim)::jsonb;
  PERFORM set_config('request.jwt.claim.sub', _ct::text, true);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', item->>'id',
    'can_manage', item->>'can_manage'
  )), '[]'::jsonb)
  INTO _ct_orphans
  FROM jsonb_array_elements(coalesce(_agenda_ct->'items', '[]'::jsonb)) item
  WHERE item->>'barbearia_id' IS NULL;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', item->>'id',
    'can_manage', item->>'can_manage'
  )), '[]'::jsonb)
  INTO _ca_orphans
  FROM jsonb_array_elements(coalesce(_agenda_ca->'items', '[]'::jsonb)) item
  WHERE item->>'barbearia_id' IS NULL;

  IF p_inject_orphan THEN
    PERFORM set_config('role', 'postgres', true);
    UPDATE public.agendamentos SET barbearia_id = _saved_barbearia WHERE id = _orphan_id;
  END IF;

  RETURN jsonb_build_object(
    'test_a', jsonb_build_object(
      'total_count', (_list->>'total_count')::int,
      'felipe_present', (
        SELECT count(*)
        FROM jsonb_array_elements(coalesce(_list->'pacientes', '[]'::jsonb)) p
        WHERE p->>'whatsapp_digits' IN ('11977687222', '5511977687222')
      ),
      'joao_pedro_present', (
        SELECT count(*)
        FROM jsonb_array_elements(coalesce(_list->'pacientes', '[]'::jsonb)) p
        WHERE p->>'cliente_nome' ILIKE '%João Pedro%'
      ),
      'orfaos_ativos_db', (
        SELECT count(*)
        FROM public.agendamentos a
        WHERE a.titular_user_id = _ct AND a.archived_at IS NULL AND a.barbearia_id IS NULL
      )
    ),
    'test_b', jsonb_build_object(
      'ct_orphan_items', _ct_orphans,
      'ca_orphan_items', _ca_orphans,
      'ct_all_orphans_can_manage', (
        SELECT CASE WHEN jsonb_array_length(_ct_orphans) = 0 THEN null
               ELSE bool_and((x->>'can_manage')::boolean) END
        FROM jsonb_array_elements(_ct_orphans) x
      ),
      'ca_any_orphan_can_manage', (
        SELECT CASE WHEN jsonb_array_length(_ca_orphans) = 0 THEN null
               ELSE bool_or(coalesce((x->>'can_manage')::boolean, false)) END
        FROM jsonb_array_elements(_ca_orphans) x
      )
    ),
    'test_c', jsonb_build_object(
      'baseline_total', _baseline_total,
      'baseline_faltas', _baseline_faltas,
      'baseline_cancel', _baseline_cancel,
      'rpc_total', (_rel->>'total')::int,
      'rpc_faltas', (_rel->>'total_faltas')::int,
      'rpc_cancel', (_rel->>'total_cancelamentos')::int,
      'totals_match', (
        _baseline_total = (_rel->>'total')::int
        AND _baseline_faltas = (_rel->>'total_faltas')::int
        AND _baseline_cancel = (_rel->>'total_cancelamentos')::int
      )
    )
  );
END;
$$;

SELECT jsonb_build_object('phase', 'DEPOIS', 'results', pg_temp.run_onda2_tests(true));

ROLLBACK;