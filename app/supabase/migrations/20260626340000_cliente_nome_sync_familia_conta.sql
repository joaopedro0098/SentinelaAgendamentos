-- Nome do cliente sincronizado na família CT+CA: CA renomeia → CT vê em Pacientes/Agendamentos sem refresh manual.

CREATE OR REPLACE FUNCTION public.painel_titular_user_id()
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
      WHERE aa.aggregated_user_id = auth.uid()
        AND aa.status = 'active'::public.aggregated_account_status
      LIMIT 1
    ),
    auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.painel_titular_user_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.painel_barbearia_ids_familia_conta()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT b.id), ARRAY[]::uuid[])
  FROM public.barbearias b
  JOIN public.barbershops s ON s.slug = b.slug
  WHERE public.painel_titular_user_id() IS NOT NULL
    AND (
      s.owner_id = public.painel_titular_user_id()
      OR s.owner_id IN (
        SELECT aa.aggregated_user_id
        FROM public.aggregated_accounts aa
        WHERE aa.owner_user_id = public.painel_titular_user_id()
          AND aa.status = 'active'::public.aggregated_account_status
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.painel_barbearia_ids_familia_conta() TO authenticated;

COMMENT ON FUNCTION public.painel_barbearia_ids_familia_conta() IS
  'Barbearias da família CT+CA (titular e agregadas ativas) para sincronizar nome do cliente por WhatsApp.';

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
    (SELECT c.nome FROM public.clientes c WHERE c.id = p_cliente_id),
    (
      SELECT c.nome
      FROM public.clientes c
      WHERE c.whatsapp = public.cliente_whatsapp_digits(p_cliente_whatsapp)
        AND c.barbearia_id = ANY(public.painel_barbearia_ids_familia_conta())
      ORDER BY c.updated_at DESC
      LIMIT 1
    ),
    (
      SELECT c.nome
      FROM public.clientes c
      WHERE c.barbearia_id = p_barbearia_id
        AND c.whatsapp = public.cliente_whatsapp_digits(p_cliente_whatsapp)
      LIMIT 1
    ),
    NULLIF(trim(p_fallback), '')
  );
$$;

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
  _digits text;
  _nome text;
  _barbearia_ids_autor uuid[];
  _barbearia_ids_sync uuid[];
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

  -- Quem pode iniciar a edição: barbearia própria (CA ou CT). CT nunca inicia em paciente só da CA.
  _barbearia_ids_autor := public.painel_barbearia_ids_editaveis();
  -- Onde o nome é propagado: família CT+CA inteira (mesmo WhatsApp).
  _barbearia_ids_sync := public.painel_barbearia_ids_familia_conta();

  IF coalesce(array_length(_barbearia_ids_autor, 1), 0) = 0
     OR coalesce(array_length(_barbearia_ids_sync, 1), 0) = 0 THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.agendamentos a
    WHERE a.barbearia_id = ANY(_barbearia_ids_autor)
      AND public.cliente_whatsapp_digits(a.cliente_whatsapp) = _digits
      AND (
        a.status = 'concluido'::public.agendamento_status
        OR EXISTS (
          SELECT 1 FROM public.agendamento_anotacoes an WHERE an.agendamento_id = a.id
        )
      )
  ) THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  INSERT INTO public.clientes (barbearia_id, nome, whatsapp)
  SELECT DISTINCT a.barbearia_id, _nome, _digits
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids_sync)
    AND public.cliente_whatsapp_digits(a.cliente_whatsapp) = _digits
  ON CONFLICT (barbearia_id, whatsapp)
  DO UPDATE SET nome = EXCLUDED.nome, updated_at = now();

  GET DIAGNOSTICS _updated_clientes = ROW_COUNT;

  UPDATE public.clientes c
  SET nome = _nome, updated_at = now()
  WHERE c.barbearia_id = ANY(_barbearia_ids_sync)
    AND c.whatsapp = _digits;

  UPDATE public.agendamentos a
  SET cliente_nome = _nome
  WHERE a.barbearia_id = ANY(_barbearia_ids_sync)
    AND public.cliente_whatsapp_digits(a.cliente_whatsapp) = _digits;

  GET DIAGNOSTICS _updated_agendamentos = ROW_COUNT;

  UPDATE public.agendamentos a
  SET cliente_id = c.id
  FROM public.clientes c
  WHERE a.barbearia_id = ANY(_barbearia_ids_sync)
    AND public.cliente_whatsapp_digits(a.cliente_whatsapp) = _digits
    AND c.barbearia_id = a.barbearia_id
    AND c.whatsapp = _digits
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

CREATE OR REPLACE FUNCTION public.list_pacientes_painel(p_barbeiro_id uuid DEFAULT NULL)
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
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  _barbearia_ids := public.painel_barbearia_ids_pacientes_visiveis();
  _barbearia_ids_familia := public.painel_barbearia_ids_familia_conta();
  _barbearia_ids_editaveis := public.painel_barbearia_ids_editaveis();

  IF coalesce(array_length(_barbearia_ids, 1), 0) = 0 THEN
    RETURN json_build_object('pacientes', '[]'::json, 'profissionais', '[]'::json);
  END IF;

  SELECT coalesce(json_agg(row_to_json(p) ORDER BY p.ultimo_atendimento DESC, p.cliente_nome), '[]'::json)
  INTO _pacientes
  FROM (
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
      WHERE a.barbearia_id = ANY(_barbearia_ids)
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
    )
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
  ) p;

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

  RETURN json_build_object(
    'pacientes', _pacientes,
    'profissionais', _profissionais
  );
END;
$$;
