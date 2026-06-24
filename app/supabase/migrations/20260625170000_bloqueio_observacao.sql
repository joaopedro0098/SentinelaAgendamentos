-- Motivo opcional (texto livre) nos bloqueios do painel.

ALTER TABLE public.bloqueios
  ADD COLUMN IF NOT EXISTS observacao text;

COMMENT ON COLUMN public.bloqueios.observacao IS
  'Texto livre opcional exibido no painel Bloqueios. motivo continua reservado ao tipo (ferias, painel).';

DROP FUNCTION IF EXISTS public.salvar_bloqueios_dia_painel(uuid, date, text, text[]);

CREATE OR REPLACE FUNCTION public.salvar_bloqueios_dia_painel(
  p_barbeiro_id uuid,
  p_data        date,
  p_modo        text,
  p_horarios    text[] DEFAULT '{}',
  p_observacao  text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _slot_min int;
  _h text;
  _hi time;
  _hf time;
  _obs text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.painel_pode_gerenciar_barbeiro(p_barbeiro_id) THEN
    RAISE EXCEPTION 'Sem permissão para bloquear este profissional';
  END IF;

  IF p_data IS NULL OR p_modo IS NULL THEN
    RAISE EXCEPTION 'Dados inválidos';
  END IF;

  _obs := NULLIF(trim(p_observacao), '');
  IF _obs IS NOT NULL THEN
    _obs := left(_obs, 120);
  END IF;

  SELECT COALESCE(br.slot_minutos, 30) INTO _slot_min
  FROM public.barbeiros br
  WHERE br.id = p_barbeiro_id;

  IF p_modo = 'total' THEN
    IF public.bloqueio_conflita_agendamentos(p_barbeiro_id, p_data, NULL, NULL) THEN
      RAISE EXCEPTION 'Você tem agendamentos já feitos para este período, altere-os ou cancele para seguir com o bloqueio.';
    END IF;

    DELETE FROM public.bloqueios bl
    WHERE bl.barbeiro_id = p_barbeiro_id
      AND bl.data = p_data
      AND (bl.motivo IS DISTINCT FROM 'ferias');

    INSERT INTO public.bloqueios (barbeiro_id, data, hora_inicio, hora_fim, motivo, observacao)
    VALUES (p_barbeiro_id, p_data, NULL, NULL, 'painel', _obs);
    RETURN;
  END IF;

  IF p_modo <> 'parcial' THEN
    RAISE EXCEPTION 'Modo inválido';
  END IF;

  IF p_horarios IS NOT NULL THEN
    FOREACH _h IN ARRAY p_horarios LOOP
      _hi := (_h || ':00')::time;
      _hf := _hi + make_interval(mins => _slot_min);
      IF public.bloqueio_conflita_agendamentos(p_barbeiro_id, p_data, _hi, _hf) THEN
        RAISE EXCEPTION 'Você tem agendamentos já feitos para este período, altere-os ou cancele para seguir com o bloqueio.';
      END IF;
    END LOOP;
  END IF;

  DELETE FROM public.bloqueios bl
  WHERE bl.barbeiro_id = p_barbeiro_id
    AND bl.data = p_data
    AND (bl.motivo IS DISTINCT FROM 'ferias');

  IF p_horarios IS NULL OR cardinality(p_horarios) = 0 THEN
    RETURN;
  END IF;

  FOREACH _h IN ARRAY p_horarios LOOP
    _hi := (_h || ':00')::time;
    _hf := _hi + make_interval(mins => _slot_min);
    INSERT INTO public.bloqueios (barbeiro_id, data, hora_inicio, hora_fim, motivo, observacao)
    VALUES (p_barbeiro_id, p_data, _hi, _hf, 'painel', _obs);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.salvar_bloqueios_dia_painel(uuid, date, text, text[], text) TO authenticated;

COMMENT ON FUNCTION public.salvar_bloqueios_dia_painel(uuid, date, text, text[], text) IS
  'Painel: sobrescreve bloqueios do dia (parcial ou total), preservando férias. observacao é opcional.';

-- get_bloqueios_painel: inclui observacao nos bloqueios (próprios + CA).

CREATE OR REPLACE FUNCTION public.get_bloqueios_painel(
  p_barbershop_id uuid,
  p_from          date,
  p_to            date
)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _slug text;
  _hoje date;
  _is_viewer_ca boolean;
  _result json;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF NOT public.user_owns_barbershop(p_barbershop_id) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  SELECT bs.slug INTO _slug
  FROM public.barbershops bs
  WHERE bs.id = p_barbershop_id
  LIMIT 1;

  IF _slug IS NULL THEN
    RETURN json_build_object('error', 'shop_not_found');
  END IF;

  PERFORM public.ensure_agenda_from_barbershop_slug(_slug);

  _hoje := (timezone('America/Sao_Paulo', now()))::date;

  _is_viewer_ca := EXISTS (
    SELECT 1
    FROM public.aggregated_accounts aa
    JOIN public.barbershops bs ON bs.owner_id = aa.aggregated_user_id
    WHERE bs.id = p_barbershop_id
      AND aa.status = 'active'::public.aggregated_account_status
  );

  SELECT json_build_object(
    'profissionais', COALESCE((
      SELECT json_agg(json_build_object(
        'staff_id', s.id,
        'nome', s.name,
        'barbeiro_id', br.id,
        'slot_minutos', COALESCE(br.slot_minutos, 30),
        'disponibilidades', (
          SELECT COALESCE(json_agg(json_build_object(
            'dia_semana', d.dia_semana,
            'hora_inicio', d.hora_inicio,
            'hora_fim', d.hora_fim
          ) ORDER BY d.dia_semana, d.hora_inicio), '[]'::json)
          FROM public.disponibilidades d
          WHERE d.barbeiro_id = br.id
        )
      ) ORDER BY s.sort_order, s.name)
      FROM public.staff s
      JOIN public.barbeiros br ON br.staff_id = s.id
      WHERE s.barbershop_id = p_barbershop_id
        AND s.is_active = true
    ), '[]'::json),
    'bloqueios', COALESCE((
      SELECT json_agg(json_build_object(
        'id', bx.id,
        'barbeiro_id', bx.barbeiro_id,
        'nome', bx.nome,
        'data', bx.data,
        'hora_inicio', bx.hora_inicio,
        'hora_fim', bx.hora_fim,
        'motivo', bx.motivo,
        'observacao', bx.observacao,
        'is_ca', bx.is_ca
      ) ORDER BY bx.data, bx.is_ca, bx.nome, bx.hora_inicio NULLS FIRST)
      FROM (
        SELECT
          bl.id,
          br.id AS barbeiro_id,
          s.name AS nome,
          bl.data,
          bl.hora_inicio,
          bl.hora_fim,
          bl.motivo,
          bl.observacao,
          false AS is_ca
        FROM public.bloqueios bl
        JOIN public.barbeiros br ON br.id = bl.barbeiro_id
        JOIN public.staff s ON s.id = br.staff_id
        WHERE s.barbershop_id = p_barbershop_id
          AND s.is_active = true
          AND bl.data BETWEEN p_from AND p_to

        UNION ALL

        SELECT
          bl.id,
          br.id AS barbeiro_id,
          s.name AS nome,
          bl.data,
          bl.hora_inicio,
          bl.hora_fim,
          bl.motivo,
          bl.observacao,
          true AS is_ca
        FROM public.bloqueios bl
        JOIN public.barbeiros br ON br.id = bl.barbeiro_id
        JOIN public.staff s ON s.id = br.staff_id
        JOIN public.barbershops cs ON cs.id = s.barbershop_id
        JOIN public.aggregated_accounts aa
          ON aa.aggregated_user_id = cs.owner_id
         AND aa.status = 'active'::public.aggregated_account_status
        JOIN public.barbershops hub ON hub.id = p_barbershop_id
          AND hub.owner_id = aa.owner_user_id
        WHERE NOT _is_viewer_ca
          AND s.is_active = true
          AND bl.data BETWEEN p_from AND p_to
      ) bx
    ), '[]'::json),
    'ferias_vigentes', COALESCE((
      SELECT json_agg(json_build_object(
        'barbeiro_id', fv.barbeiro_id,
        'nome', fv.nome,
        'data_inicio', fv.data_inicio,
        'data_fim', fv.data_fim,
        'is_ca', fv.is_ca
      ) ORDER BY fv.nome)
      FROM (
        SELECT
          fp.barbeiro_id,
          fp.nome,
          fp.data_inicio,
          fp.data_fim,
          fp.is_ca
        FROM (
          SELECT
            br.id AS barbeiro_id,
            s.name AS nome,
            MIN(bl.data) AS data_inicio,
            MAX(bl.data) AS data_fim,
            false AS is_ca
          FROM public.bloqueios bl
          JOIN public.barbeiros br ON br.id = bl.barbeiro_id
          JOIN public.staff s ON s.id = br.staff_id
          WHERE s.barbershop_id = p_barbershop_id
            AND s.is_active = true
            AND bl.motivo = 'ferias'
            AND bl.data = _hoje
            AND bl.hora_inicio IS NULL
            AND bl.hora_fim IS NULL
          GROUP BY br.id, s.name

          UNION ALL

          SELECT
            br.id AS barbeiro_id,
            s.name AS nome,
            MIN(bl.data) AS data_inicio,
            MAX(bl.data) AS data_fim,
            true AS is_ca
          FROM public.bloqueios bl
          JOIN public.barbeiros br ON br.id = bl.barbeiro_id
          JOIN public.staff s ON s.id = br.staff_id
          JOIN public.barbershops cs ON cs.id = s.barbershop_id
          JOIN public.aggregated_accounts aa
            ON aa.aggregated_user_id = cs.owner_id
           AND aa.status = 'active'::public.aggregated_account_status
          JOIN public.barbershops hub ON hub.id = p_barbershop_id
            AND hub.owner_id = aa.owner_user_id
          WHERE NOT _is_viewer_ca
            AND s.is_active = true
            AND bl.motivo = 'ferias'
            AND bl.data = _hoje
            AND bl.hora_inicio IS NULL
            AND bl.hora_fim IS NULL
          GROUP BY br.id, s.name
        ) fp
      ) fv
    ), '[]'::json),
    'ferias_programadas', COALESCE((
      SELECT json_agg(json_build_object(
        'barbeiro_id', fp.barbeiro_id,
        'nome', fp.nome,
        'data_inicio', fp.data_inicio,
        'data_fim', fp.data_fim,
        'is_ca', fp.is_ca
      ) ORDER BY fp.is_ca, fp.nome, fp.data_inicio)
      FROM (
        WITH ferias_dias_proprios AS (
          SELECT
            br.id AS barbeiro_id,
            s.name AS nome,
            bl.data,
            bl.data - (ROW_NUMBER() OVER (PARTITION BY br.id ORDER BY bl.data))::int AS grp
          FROM public.bloqueios bl
          JOIN public.barbeiros br ON br.id = bl.barbeiro_id
          JOIN public.staff s ON s.id = br.staff_id
          WHERE s.barbershop_id = p_barbershop_id
            AND s.is_active = true
            AND bl.motivo = 'ferias'
            AND bl.hora_inicio IS NULL
            AND bl.hora_fim IS NULL
        ),
        periodos_proprios AS (
          SELECT
            barbeiro_id,
            nome,
            MIN(data) AS data_inicio,
            MAX(data) AS data_fim,
            false AS is_ca
          FROM ferias_dias_proprios
          GROUP BY barbeiro_id, nome, grp
        ),
        ferias_dias_ca AS (
          SELECT
            br.id AS barbeiro_id,
            s.name AS nome,
            bl.data,
            bl.data - (ROW_NUMBER() OVER (PARTITION BY br.id ORDER BY bl.data))::int AS grp
          FROM public.bloqueios bl
          JOIN public.barbeiros br ON br.id = bl.barbeiro_id
          JOIN public.staff s ON s.id = br.staff_id
          JOIN public.barbershops cs ON cs.id = s.barbershop_id
          JOIN public.aggregated_accounts aa
            ON aa.aggregated_user_id = cs.owner_id
           AND aa.status = 'active'::public.aggregated_account_status
          JOIN public.barbershops hub ON hub.id = p_barbershop_id
            AND hub.owner_id = aa.owner_user_id
          WHERE NOT _is_viewer_ca
            AND s.is_active = true
            AND bl.motivo = 'ferias'
            AND bl.hora_inicio IS NULL
            AND bl.hora_fim IS NULL
        ),
        periodos_ca AS (
          SELECT
            barbeiro_id,
            nome,
            MIN(data) AS data_inicio,
            MAX(data) AS data_fim,
            true AS is_ca
          FROM ferias_dias_ca
          GROUP BY barbeiro_id, nome, grp
        )
        SELECT * FROM periodos_proprios WHERE data_fim >= _hoje
        UNION ALL
        SELECT * FROM periodos_ca WHERE data_fim >= _hoje
      ) fp
    ), '[]'::json)
  ) INTO _result;

  RETURN _result;
END;
$$;
