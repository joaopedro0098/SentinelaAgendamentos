-- Unifica pacientes na lista quando o WhatsApp é o mesmo número com formatos diferentes
-- (ex.: 5511999999999 vs 11999999999), alinhado a whatsapp_match_digits.

CREATE OR REPLACE FUNCTION public.cliente_whatsapp_painel_key(p_whatsapp text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN length(v) >= 11 THEN right(v, 11)
    ELSE v
  END
  FROM (SELECT public.cliente_whatsapp_digits(p_whatsapp) AS v) x
  WHERE length(v) >= 10;
$$;

COMMENT ON FUNCTION public.cliente_whatsapp_painel_key(text) IS
  'Chave estável para agrupar paciente no painel; mesma equivalência que whatsapp_match_digits (últimos 11 dígitos).';

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
  matching_keys AS (
    SELECT DISTINCT public.cliente_whatsapp_painel_key(md.whatsapp_digits) AS painel_key
    FROM matching_digits md
    WHERE public.cliente_whatsapp_painel_key(md.whatsapp_digits) IS NOT NULL
  ),
  scoped AS (
    SELECT
      public.cliente_whatsapp_painel_key(a.cliente_whatsapp) AS painel_key,
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
      AND public.cliente_whatsapp_painel_key(a.cliente_whatsapp) IS NOT NULL
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
        OR public.cliente_whatsapp_painel_key(a.cliente_whatsapp) IN (SELECT mk.painel_key FROM matching_keys mk)
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
      s.painel_key,
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
      g.painel_key,
      COALESCE(
        (
          SELECT c.whatsapp
          FROM public.clientes c
          WHERE c.titular_user_id = _titular
            AND c.archived_at IS NULL
            AND public.cliente_whatsapp_painel_key(c.whatsapp) = g.painel_key
          ORDER BY length(c.whatsapp) DESC, c.updated_at DESC
          LIMIT 1
        ),
        (
          SELECT w.whatsapp_digits
          FROM with_anot w
          WHERE w.painel_key = g.painel_key
          ORDER BY length(w.whatsapp_digits) DESC, w.data DESC, w.hora DESC
          LIMIT 1
        )
      ) AS whatsapp_digits,
      COALESCE(
        (
          SELECT c.nome
          FROM public.clientes c
          WHERE c.titular_user_id = _titular
            AND c.archived_at IS NULL
            AND public.cliente_whatsapp_painel_key(c.whatsapp) = g.painel_key
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
          WHERE w.painel_key = g.painel_key
          ORDER BY w.data DESC, w.hora DESC
          LIMIT 1
        )
      ) AS cliente_nome,
      (
        SELECT c.data_nascimento
        FROM public.clientes c
        WHERE c.titular_user_id = _titular
          AND c.archived_at IS NULL
          AND public.cliente_whatsapp_painel_key(c.whatsapp) = g.painel_key
        ORDER BY (c.data_nascimento IS NOT NULL) DESC, c.updated_at DESC
        LIMIT 1
      ) AS data_nascimento,
      (
        SELECT c.avatar_url
        FROM public.clientes c
        WHERE c.titular_user_id = _titular
          AND c.archived_at IS NULL
          AND public.cliente_whatsapp_painel_key(c.whatsapp) = g.painel_key
        ORDER BY (c.avatar_url IS NOT NULL AND trim(c.avatar_url) <> '') DESC, c.updated_at DESC
        LIMIT 1
      ) AS avatar_url,
      (
        SELECT c.id
        FROM public.clientes c
        WHERE c.titular_user_id = _titular
          AND c.archived_at IS NULL
          AND public.cliente_whatsapp_painel_key(c.whatsapp) = g.painel_key
        ORDER BY c.updated_at DESC
        LIMIT 1
      ) AS cliente_id,
      COALESCE(
        (
          SELECT c.auth_user_id IS NOT NULL
          FROM public.clientes c
          WHERE c.titular_user_id = _titular
            AND c.archived_at IS NULL
            AND public.cliente_whatsapp_painel_key(c.whatsapp) = g.painel_key
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
        WHERE w.painel_key = g.painel_key
          AND (
            w.barbearia_id = ANY(_barbearia_ids_editaveis)
            OR (w.barbearia_id IS NULL AND auth.uid() = _titular)
          )
      ) AS can_rename_nome
    FROM with_anot g
    GROUP BY g.painel_key
  ),
  cadastro_only AS (
    SELECT DISTINCT ON (public.cliente_whatsapp_painel_key(c.whatsapp))
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
    ORDER BY public.cliente_whatsapp_painel_key(c.whatsapp), c.updated_at DESC
  ),
  grouped AS (
    SELECT
      ag.whatsapp_digits,
      ag.cliente_nome,
      ag.data_nascimento,
      ag.avatar_url,
      ag.cliente_id,
      ag.conta_ativada,
      ag.ultimo_atendimento,
      ag.total_concluidos,
      ag.total_anotacoes,
      ag.can_rename_nome
    FROM appt_grouped ag
    UNION ALL
    SELECT
      co.whatsapp_digits,
      co.cliente_nome,
      co.data_nascimento,
      co.avatar_url,
      co.cliente_id,
      co.conta_ativada,
      co.ultimo_atendimento,
      co.total_concluidos,
      co.total_anotacoes,
      co.can_rename_nome
    FROM cadastro_only co
    WHERE NOT EXISTS (
      SELECT 1
      FROM appt_grouped ag2
      WHERE ag2.painel_key = public.cliente_whatsapp_painel_key(co.whatsapp_digits)
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

GRANT EXECUTE ON FUNCTION public.cliente_whatsapp_painel_key(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_pacientes_painel(uuid, text, int, int) TO authenticated;
