-- Pacientes excluídos pelo CT somem da lista do painel (histórico clínico permanece no banco).

CREATE TABLE IF NOT EXISTS public.paciente_painel_removidos (
  titular_user_id uuid NOT NULL,
  whatsapp_digits text NOT NULL,
  removed_at timestamptz NOT NULL DEFAULT now(),
  removed_by uuid NOT NULL,
  PRIMARY KEY (titular_user_id, whatsapp_digits),
  CONSTRAINT paciente_painel_removidos_titular_fkey
    FOREIGN KEY (titular_user_id) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT paciente_painel_removidos_removed_by_fkey
    FOREIGN KEY (removed_by) REFERENCES auth.users (id) ON DELETE RESTRICT
);

COMMENT ON TABLE public.paciente_painel_removidos IS
  'WhatsApps ocultos da aba Pacientes após exclusão de cadastro pelo CT titular.';

ALTER TABLE public.paciente_painel_removidos ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.paciente_painel_esta_removido(
  p_titular_user_id uuid,
  p_whatsapp_digits text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.paciente_painel_removidos r
    WHERE r.titular_user_id = p_titular_user_id
      AND public.whatsapp_match_digits(r.whatsapp_digits, p_whatsapp_digits)
  );
$$;

GRANT EXECUTE ON FUNCTION public.paciente_painel_esta_removido(uuid, text) TO authenticated;

-- delete: arquiva cadastro + marca como removido da lista
CREATE OR REPLACE FUNCTION public.delete_paciente_cadastro_painel(p_whatsapp_digits text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _titular uuid;
  _digits text;
  _archived_clientes int;
  _archived_docs int;
  _visivel boolean;
BEGIN
  IF _actor IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.aggregated_accounts aa
    WHERE aa.aggregated_user_id = _actor
      AND aa.status = 'active'::public.aggregated_account_status
  ) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  _titular := _actor;
  _digits := public.cliente_whatsapp_digits(p_whatsapp_digits);
  IF length(_digits) < 10 THEN
    RETURN json_build_object('error', 'invalid_whatsapp');
  END IF;

  SELECT (
    EXISTS (
      SELECT 1
      FROM public.clientes c
      WHERE c.titular_user_id = _titular
        AND c.archived_at IS NULL
        AND public.whatsapp_match_digits(c.whatsapp, _digits)
        AND (
          c.barbearia_id IS NULL
          OR c.barbearia_id = ANY(public.painel_barbearia_ids_pacientes_visiveis())
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.agendamentos a
      WHERE a.titular_user_id = _titular
        AND a.archived_at IS NULL
        AND public.whatsapp_match_digits(a.cliente_whatsapp, _digits)
        AND length(public.cliente_whatsapp_digits(a.cliente_whatsapp)) >= 10
        AND (
          public.painel_agendamento_visivel_pacientes(
            a.barbearia_id,
            a.barbeiro_id,
            public.painel_barbearia_ids_pacientes_visiveis()
          )
          OR (a.barbearia_id IS NULL AND a.titular_user_id = _titular)
        )
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
  ) INTO _visivel;

  IF NOT _visivel THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  UPDATE public.clientes c
  SET archived_at = now(), archived_by = _actor
  WHERE c.titular_user_id = _titular
    AND c.archived_at IS NULL
    AND public.whatsapp_match_digits(c.whatsapp, _digits);

  GET DIAGNOSTICS _archived_clientes = ROW_COUNT;

  UPDATE public.paciente_documentos pd
  SET archived_at = now(), archived_by = _actor
  WHERE pd.titular_user_id = _titular
    AND pd.archived_at IS NULL
    AND public.whatsapp_match_digits(pd.whatsapp_digits, _digits);

  GET DIAGNOSTICS _archived_docs = ROW_COUNT;

  INSERT INTO public.paciente_painel_removidos (titular_user_id, whatsapp_digits, removed_at, removed_by)
  VALUES (_titular, _digits, now(), _actor)
  ON CONFLICT (titular_user_id, whatsapp_digits)
  DO UPDATE SET removed_at = now(), removed_by = EXCLUDED.removed_by;

  RETURN json_build_object(
    'ok', true,
    'archived_clientes', _archived_clientes,
    'archived_documentos', _archived_docs
  );
END;
$$;

-- list_pacientes_painel: excluir removidos da lista
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

-- Recriar paciente: volta a aparecer na lista
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

  DELETE FROM public.paciente_painel_removidos r
  WHERE r.titular_user_id = _titular
    AND public.whatsapp_match_digits(r.whatsapp_digits, _digits);

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

GRANT EXECUTE ON FUNCTION public.delete_paciente_cadastro_painel(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_pacientes_painel(uuid, text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_paciente_cadastro_painel(text, text, date) TO authenticated;
