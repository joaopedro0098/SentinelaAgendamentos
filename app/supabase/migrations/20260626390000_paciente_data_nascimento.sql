-- Data de nascimento opcional em clientes (aba Pacientes → Dados cadastrais).

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS data_nascimento date;

COMMENT ON COLUMN public.clientes.data_nascimento IS
  'Data de nascimento do paciente (opcional), editável na aba Pacientes.';

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
  _digits text;
  _barbearia_ids_autor uuid[];
  _barbearia_ids_sync uuid[];
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

  INSERT INTO public.clientes (barbearia_id, nome, whatsapp, data_nascimento)
  SELECT DISTINCT a.barbearia_id, a.cliente_nome, _digits, p_data_nascimento
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids_sync)
    AND public.cliente_whatsapp_digits(a.cliente_whatsapp) = _digits
  ON CONFLICT (barbearia_id, whatsapp)
  DO UPDATE SET
    data_nascimento = EXCLUDED.data_nascimento,
    updated_at = now();

  UPDATE public.clientes c
  SET data_nascimento = p_data_nascimento, updated_at = now()
  WHERE c.barbearia_id = ANY(_barbearia_ids_sync)
    AND c.whatsapp = _digits;

  GET DIAGNOSTICS _updated = ROW_COUNT;

  RETURN json_build_object(
    'ok', true,
    'whatsapp_digits', _digits,
    'data_nascimento', p_data_nascimento,
    'updated_clientes', _updated
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_paciente_data_nascimento_painel(text, date) TO authenticated;

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
      (
        SELECT c.data_nascimento
        FROM public.clientes c
        WHERE c.barbearia_id = ANY(_barbearia_ids_familia)
          AND c.whatsapp = g.whatsapp_digits
        ORDER BY (c.data_nascimento IS NOT NULL) DESC, c.updated_at DESC
        LIMIT 1
      ) AS data_nascimento,
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
