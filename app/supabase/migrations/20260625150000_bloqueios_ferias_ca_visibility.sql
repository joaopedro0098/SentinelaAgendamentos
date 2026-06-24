-- CT/AA: exibe férias de colaboradores de CAs agregadas em ferias_programadas (somente leitura).

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
        'id', bl.id,
        'barbeiro_id', bl.barbeiro_id,
        'data', bl.data,
        'hora_inicio', bl.hora_inicio,
        'hora_fim', bl.hora_fim,
        'motivo', bl.motivo
      ) ORDER BY bl.data, bl.hora_inicio NULLS FIRST)
      FROM public.bloqueios bl
      JOIN public.barbeiros br ON br.id = bl.barbeiro_id
      JOIN public.staff s ON s.id = br.staff_id
      WHERE s.barbershop_id = p_barbershop_id
        AND s.is_active = true
        AND bl.data BETWEEN p_from AND p_to
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

COMMENT ON FUNCTION public.get_bloqueios_painel(uuid, date, date) IS
  'Painel Bloqueios: profissionais próprios, bloqueios, férias próprias e (para CT/AA) férias de CAs agregadas.';
