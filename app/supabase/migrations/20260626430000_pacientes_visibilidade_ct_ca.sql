-- Pacientes: CT vê todas as CAs ativas; conteúdo de anotação CA exige owner_can_view_annotations.
-- Inclui agendamentos pelo barbeiro da barbearia visível (CT agendou colaborador CA).

CREATE OR REPLACE FUNCTION public.painel_barbearia_ids_pacientes_visiveis()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT v.id), ARRAY[]::uuid[])
  FROM (
    SELECT b.id
    FROM public.barbearias b
    JOIN public.barbershops s ON s.slug = b.slug
    WHERE s.owner_id = auth.uid()

    UNION

    SELECT b.id
    FROM public.aggregated_accounts aa
    JOIN public.barbershops cs ON cs.owner_id = aa.aggregated_user_id
    JOIN public.barbearias b ON b.slug = cs.slug
    WHERE aa.owner_user_id = auth.uid()
      AND aa.status = 'active'::public.aggregated_account_status
      AND NOT EXISTS (
        SELECT 1
        FROM public.aggregated_accounts self
        WHERE self.aggregated_user_id = auth.uid()
          AND self.status = 'active'::public.aggregated_account_status
      )
  ) v
  WHERE v.id IS NOT NULL;
$$;

COMMENT ON FUNCTION public.painel_barbearia_ids_pacientes_visiveis() IS
  'Barbearias cujos pacientes aparecem na aba Pacientes: própria + todas as CAs ativas do titular.';

CREATE OR REPLACE FUNCTION public.painel_agendamento_visivel_pacientes(
  p_agendamento_barbearia_id uuid,
  p_barbeiro_id uuid,
  p_barbearia_ids uuid[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    p_agendamento_barbearia_id = ANY(p_barbearia_ids)
    OR EXISTS (
      SELECT 1
      FROM public.barbeiros bb
      WHERE bb.id = p_barbeiro_id
        AND bb.barbearia_id = ANY(p_barbearia_ids)
    );
$$;

COMMENT ON FUNCTION public.painel_agendamento_visivel_pacientes(uuid, uuid, uuid[]) IS
  'Agendamento entra na aba Pacientes se a barbearia do registro ou do profissional está no escopo visível.';

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
      AND s.owner_id = auth.uid()
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
      AND public.painel_agendamento_visivel_pacientes(
        a.barbearia_id,
        a.barbeiro_id,
        public.painel_barbearia_ids_pacientes_visiveis()
      )
  );
$$;

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
  WHERE an.agendamento_id = p_agendamento_id;

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
    LEFT JOIN public.agendamento_anotacoes an ON an.agendamento_id = a.id
    WHERE public.painel_agendamento_visivel_pacientes(a.barbearia_id, a.barbeiro_id, _barbearia_ids)
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

-- list_pacientes_painel: escopo ampliado (barbeiro da barbearia visível)
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

  WITH scoped AS (
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
    WHERE _search IS NULL OR g.cliente_nome ILIKE ('%' || _search || '%')
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
          AND (
            ag.status = 'concluido'::public.agendamento_status
            OR EXISTS (
              SELECT 1
              FROM public.agendamento_anotacoes an
              WHERE an.agendamento_id = ag.id
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
