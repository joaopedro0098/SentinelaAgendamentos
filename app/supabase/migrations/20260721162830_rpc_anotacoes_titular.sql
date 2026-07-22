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
