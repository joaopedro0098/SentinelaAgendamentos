-- Períodos de férias ativos/futuros (gap-and-islands) para o painel Bloqueios.

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
        'data_fim', fv.data_fim
      ) ORDER BY fv.nome)
      FROM (
        SELECT
          br.id AS barbeiro_id,
          s.name AS nome,
          MIN(bl.data) AS data_inicio,
          MAX(bl.data) AS data_fim
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
      ) fv
    ), '[]'::json),
    'ferias_programadas', COALESCE((
      SELECT json_agg(json_build_object(
        'barbeiro_id', fp.barbeiro_id,
        'nome', fp.nome,
        'data_inicio', fp.data_inicio,
        'data_fim', fp.data_fim
      ) ORDER BY fp.nome, fp.data_inicio)
      FROM (
        WITH ferias_dias AS (
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
        periodos AS (
          SELECT
            barbeiro_id,
            nome,
            MIN(data) AS data_inicio,
            MAX(data) AS data_fim
          FROM ferias_dias
          GROUP BY barbeiro_id, nome, grp
        )
        SELECT barbeiro_id, nome, data_inicio, data_fim
        FROM periodos
        WHERE data_fim >= _hoje
      ) fp
    ), '[]'::json)
  ) INTO _result;

  RETURN _result;
END;
$$;

COMMENT ON FUNCTION public.get_bloqueios_painel(uuid, date, date) IS
  'Painel Bloqueios: profissionais, bloqueios no período, férias vigentes hoje e períodos de férias ativos/futuros.';
