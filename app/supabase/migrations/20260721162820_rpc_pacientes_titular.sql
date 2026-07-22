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
