-- Fase A: cliente_id no create/list, link de ativação único por paciente, verify com slug e conta existente.

-- create_paciente_cadastro_painel: retorna cliente_id (bloqueador do fluxo de ativação)
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
  _cliente_id uuid;
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
  VALUES (_barbearia_id, _nome, _digits, p_data_nascimento, _titular)
  RETURNING id INTO _cliente_id;

  DELETE FROM public.paciente_painel_removidos r
  WHERE r.titular_user_id = _titular
    AND public.whatsapp_match_digits(r.whatsapp_digits, _digits);

  RETURN json_build_object(
    'ok', true,
    'patient', json_build_object(
      'cliente_id', _cliente_id,
      'whatsapp_digits', _digits,
      'cliente_nome', _nome,
      'data_nascimento', p_data_nascimento,
      'avatar_url', NULL,
      'ultimo_atendimento', CURRENT_DATE,
      'total_concluidos', 0,
      'total_anotacoes', 0,
      'can_rename_nome', true,
      'conta_ativada', false
    )
  );
END;
$$;

-- list_pacientes_painel: expõe cliente_id e conta_ativada para UI de compartilhamento
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
            AND public.whatsapp_match_digits(c.whatsapp, g.whatsapp_digits)
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
          AND public.whatsapp_match_digits(c.whatsapp, g.whatsapp_digits)
        ORDER BY (c.data_nascimento IS NOT NULL) DESC, c.updated_at DESC
        LIMIT 1
      ) AS data_nascimento,
      (
        SELECT c.avatar_url
        FROM public.clientes c
        WHERE c.titular_user_id = _titular
          AND c.archived_at IS NULL
          AND public.whatsapp_match_digits(c.whatsapp, g.whatsapp_digits)
        ORDER BY (c.avatar_url IS NOT NULL AND trim(c.avatar_url) <> '') DESC, c.updated_at DESC
        LIMIT 1
      ) AS avatar_url,
      (
        SELECT c.id
        FROM public.clientes c
        WHERE c.titular_user_id = _titular
          AND c.archived_at IS NULL
          AND public.whatsapp_match_digits(c.whatsapp, g.whatsapp_digits)
        ORDER BY c.updated_at DESC
        LIMIT 1
      ) AS cliente_id,
      COALESCE(
        (
          SELECT c.auth_user_id IS NOT NULL
          FROM public.clientes c
          WHERE c.titular_user_id = _titular
            AND c.archived_at IS NULL
            AND public.whatsapp_match_digits(c.whatsapp, g.whatsapp_digits)
            AND c.auth_user_id IS NOT NULL
          LIMIT 1
        ),
        false
      ) AS conta_ativada,
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
      c.id AS cliente_id,
      (c.auth_user_id IS NOT NULL) AS conta_ativada,
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
    WHERE NOT public.paciente_painel_esta_removido(_titular, g.whatsapp_digits)
      AND (
        _search IS NULL
        OR lower(g.cliente_nome) LIKE ('%' || lower(_search) || '%')
        OR (
          _search_digits IS NOT NULL
          AND length(_search_digits) >= 4
          AND (
            g.whatsapp_digits LIKE ('%' || _search_digits || '%')
            OR public.whatsapp_match_digits(g.whatsapp_digits, _search_digits)
          )
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
              SELECT 1 FROM public.agendamento_anotacoes an
              WHERE an.agendamento_id = ag.id AND an.archived_at IS NULL
            )
          )
      )
  ) pr;

  _has_more := (_offset + _limit) < _total_count;

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

-- Invalida tokens não usados do cliente e gera um novo (único válido por vez)
CREATE OR REPLACE FUNCTION public.get_or_create_patient_activation_link(p_whatsapp_digits text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _titular uuid := public.painel_titular_user_id();
  _digits text;
  _cli record;
  _token text;
  _shop_nome text;
  _slug text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  _digits := public.cliente_whatsapp_digits(p_whatsapp_digits);
  IF length(_digits) < 10 THEN
    RETURN json_build_object('error', 'invalid_whatsapp');
  END IF;

  SELECT c.id, c.barbearia_id, c.nome, c.whatsapp, c.titular_user_id, c.auth_user_id
  INTO _cli
  FROM public.clientes c
  WHERE c.titular_user_id = _titular
    AND c.archived_at IS NULL
    AND public.whatsapp_match_digits(c.whatsapp, _digits)
  ORDER BY c.updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'no_formal_cadastro');
  END IF;

  IF _cli.titular_user_id IS DISTINCT FROM _titular
     AND NOT (_cli.barbearia_id = ANY(public.painel_barbearia_ids_pacientes_visiveis())) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  IF _cli.auth_user_id IS NOT NULL THEN
    RETURN json_build_object('error', 'already_activated');
  END IF;

  DELETE FROM public.patient_activation_tokens t
  WHERE t.cliente_id = _cli.id
    AND t.used_at IS NULL;

  _token := encode(gen_random_bytes(18), 'hex');

  INSERT INTO public.patient_activation_tokens (
    token,
    cliente_id,
    barbearia_id,
    whatsapp,
    nome
  )
  VALUES (
    _token,
    _cli.id,
    _cli.barbearia_id,
    _cli.whatsapp,
    _cli.nome
  );

  SELECT b.nome, b.slug
  INTO _shop_nome, _slug
  FROM public.barbearias b
  WHERE b.id = _cli.barbearia_id;

  RETURN json_build_object(
    'success', true,
    'token', _token,
    'nome', _cli.nome,
    'whatsapp', _cli.whatsapp,
    'barbearia_nome', COALESCE(_shop_nome, 'Clínica'),
    'barbearia_slug', _slug
  );
END;
$$;

-- create_patient_activation_token: mesma invalidação + GRANT
CREATE OR REPLACE FUNCTION public.create_patient_activation_token(p_cliente_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cli record;
  _token text;
  _shop_nome text;
  _slug text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  SELECT c.id, c.barbearia_id, c.nome, c.whatsapp, c.titular_user_id, c.auth_user_id
  INTO _cli
  FROM public.clientes c
  WHERE c.id = p_cliente_id
    AND c.archived_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'cliente_not_found');
  END IF;

  IF _cli.titular_user_id IS DISTINCT FROM public.painel_titular_user_id()
     AND NOT (_cli.barbearia_id = ANY(public.painel_barbearia_ids_pacientes_visiveis())) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  IF _cli.auth_user_id IS NOT NULL THEN
    RETURN json_build_object('error', 'already_activated');
  END IF;

  DELETE FROM public.patient_activation_tokens t
  WHERE t.cliente_id = _cli.id
    AND t.used_at IS NULL;

  _token := encode(gen_random_bytes(18), 'hex');

  INSERT INTO public.patient_activation_tokens (
    token,
    cliente_id,
    barbearia_id,
    whatsapp,
    nome
  )
  VALUES (
    _token,
    _cli.id,
    _cli.barbearia_id,
    _cli.whatsapp,
    _cli.nome
  );

  SELECT b.nome, b.slug
  INTO _shop_nome, _slug
  FROM public.barbearias b
  WHERE b.id = _cli.barbearia_id;

  RETURN json_build_object(
    'success', true,
    'token', _token,
    'nome', _cli.nome,
    'whatsapp', _cli.whatsapp,
    'barbearia_nome', COALESCE(_shop_nome, 'Clínica'),
    'barbearia_slug', _slug
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_patient_activation_token(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tok record;
  _shop_nome text;
  _slug text;
  _has_account boolean;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RETURN json_build_object('valid', false, 'reason', 'invalid_token');
  END IF;

  SELECT t.*
  INTO _tok
  FROM public.patient_activation_tokens t
  WHERE t.token = trim(p_token)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('valid', false, 'reason', 'not_found');
  END IF;

  SELECT b.nome, b.slug
  INTO _shop_nome, _slug
  FROM public.barbearias b
  WHERE b.id = _tok.barbearia_id;

  SELECT EXISTS (
    SELECT 1
    FROM public.clientes c
    WHERE c.id = _tok.cliente_id
      AND c.archived_at IS NULL
      AND c.auth_user_id IS NOT NULL
  ) INTO _has_account;

  IF _has_account THEN
    RETURN json_build_object(
      'valid', false,
      'reason', 'already_has_account',
      'nome', _tok.nome,
      'barbearia_nome', COALESCE(_shop_nome, 'Clínica'),
      'barbearia_slug', _slug
    );
  END IF;

  IF _tok.used_at IS NOT NULL THEN
    RETURN json_build_object(
      'valid', false,
      'reason', 'already_used',
      'barbearia_slug', _slug
    );
  END IF;

  IF _tok.expires_at < now() THEN
    RETURN json_build_object('valid', false, 'reason', 'expired');
  END IF;

  RETURN json_build_object(
    'valid', true,
    'token', _tok.token,
    'nome', _tok.nome,
    'whatsapp', _tok.whatsapp,
    'barbearia_nome', COALESCE(_shop_nome, 'Clínica'),
    'barbearia_slug', _slug
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.concluir_ativacao_paciente(
  p_token text,
  p_auth_user_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tok record;
  _norm_whatsapp text;
  _updated_count int := 0;
  _slug text;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RETURN json_build_object('error', 'token_invalid');
  END IF;

  IF p_auth_user_id IS NULL THEN
    RETURN json_build_object('error', 'auth_user_id_required');
  END IF;

  SELECT t.*
  INTO _tok
  FROM public.patient_activation_tokens t
  WHERE t.token = trim(p_token)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'token_not_found');
  END IF;

  SELECT b.slug INTO _slug
  FROM public.barbearias b
  WHERE b.id = _tok.barbearia_id;

  IF _tok.used_at IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.clientes WHERE id = _tok.cliente_id AND auth_user_id = p_auth_user_id
    ) THEN
      RETURN json_build_object(
        'success', true,
        'already_activated', true,
        'barbearia_slug', _slug
      );
    END IF;
    RETURN json_build_object('error', 'token_already_used');
  END IF;

  _norm_whatsapp := public.cliente_whatsapp_digits(_tok.whatsapp);

  UPDATE public.clientes
  SET auth_user_id = p_auth_user_id,
      updated_at = now()
  WHERE public.cliente_whatsapp_digits(whatsapp) = _norm_whatsapp
    AND archived_at IS NULL;

  GET DIAGNOSTICS _updated_count = ROW_COUNT;

  UPDATE public.patient_activation_tokens
  SET used_at = now()
  WHERE id = _tok.id;

  RETURN json_build_object(
    'success', true,
    'linked_clinics_count', _updated_count,
    'barbearia_slug', _slug
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_patient_activation_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_patient_activation_link(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_paciente_cadastro_painel(text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_pacientes_painel(uuid, text, int, int) TO authenticated;
