-- Bloqueios pelo painel (Configurações → Bloqueios).

CREATE OR REPLACE FUNCTION public.painel_pode_gerenciar_barbeiro(p_barbeiro_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.barbeiros br
    JOIN public.staff s ON s.id = br.staff_id
    JOIN public.barbershops bs ON bs.id = s.barbershop_id
    WHERE br.id = p_barbeiro_id
      AND bs.owner_id = auth.uid()
      AND s.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.bloqueio_conflita_agendamentos(
  p_barbeiro_id uuid,
  p_data        date,
  p_hora_inicio time,
  p_hora_fim    time
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agendamentos a
    WHERE a.barbeiro_id = p_barbeiro_id
      AND a.data = p_data
      AND a.status = 'confirmado'::public.agendamento_status
      AND (
        (p_hora_inicio IS NULL AND p_hora_fim IS NULL)
        OR (
          a.hora::time < p_hora_fim
          AND (a.hora::time + make_interval(mins => COALESCE(a.duracao_minutos, 30))) > p_hora_inicio
        )
      )
  );
$$;

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
    ), '[]'::json)
  ) INTO _result;

  RETURN _result;
END;
$$;

CREATE OR REPLACE FUNCTION public.salvar_bloqueios_dia_painel(
  p_barbeiro_id uuid,
  p_data        date,
  p_modo        text,
  p_horarios    text[] DEFAULT '{}'
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

    INSERT INTO public.bloqueios (barbeiro_id, data, hora_inicio, hora_fim, motivo)
    VALUES (p_barbeiro_id, p_data, NULL, NULL, 'painel');
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
    INSERT INTO public.bloqueios (barbeiro_id, data, hora_inicio, hora_fim, motivo)
    VALUES (p_barbeiro_id, p_data, _hi, _hf, 'painel');
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.salvar_bloqueios_ferias_painel(
  p_barbeiro_ids uuid[],
  p_data_inicio  date,
  p_data_fim     date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bid uuid;
  _d date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF p_barbeiro_ids IS NULL OR cardinality(p_barbeiro_ids) = 0 THEN
    RAISE EXCEPTION 'Selecione ao menos um profissional';
  END IF;

  IF p_data_inicio IS NULL OR p_data_fim IS NULL OR p_data_fim < p_data_inicio THEN
    RAISE EXCEPTION 'Intervalo de datas inválido';
  END IF;

  FOREACH _bid IN ARRAY p_barbeiro_ids LOOP
    IF NOT public.painel_pode_gerenciar_barbeiro(_bid) THEN
      RAISE EXCEPTION 'Sem permissão para um dos profissionais selecionados';
    END IF;

    _d := p_data_inicio;
    WHILE _d <= p_data_fim LOOP
      IF public.bloqueio_conflita_agendamentos(_bid, _d, NULL, NULL) THEN
        RAISE EXCEPTION 'Você tem agendamentos já feitos para este período, altere-os ou cancele para seguir com o bloqueio.';
      END IF;
      _d := _d + 1;
    END LOOP;
  END LOOP;

  FOREACH _bid IN ARRAY p_barbeiro_ids LOOP
    DELETE FROM public.bloqueios bl
    WHERE bl.barbeiro_id = _bid
      AND bl.motivo = 'ferias'
      AND bl.data BETWEEN p_data_inicio AND p_data_fim;

    _d := p_data_inicio;
    WHILE _d <= p_data_fim LOOP
      INSERT INTO public.bloqueios (barbeiro_id, data, hora_inicio, hora_fim, motivo)
      VALUES (_bid, _d, NULL, NULL, 'ferias');
      _d := _d + 1;
    END LOOP;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.encerrar_bloqueios_ferias_painel(p_barbeiro_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bid uuid;
  _hoje date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF p_barbeiro_ids IS NULL OR cardinality(p_barbeiro_ids) = 0 THEN
    RAISE EXCEPTION 'Selecione ao menos um profissional';
  END IF;

  _hoje := (timezone('America/Sao_Paulo', now()))::date;

  FOREACH _bid IN ARRAY p_barbeiro_ids LOOP
    IF NOT public.painel_pode_gerenciar_barbeiro(_bid) THEN
      RAISE EXCEPTION 'Sem permissão para um dos profissionais selecionados';
    END IF;

    DELETE FROM public.bloqueios bl
    WHERE bl.barbeiro_id = _bid
      AND bl.motivo = 'ferias'
      AND bl.data >= _hoje;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.painel_pode_gerenciar_barbeiro(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_bloqueios_painel(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_bloqueios_dia_painel(uuid, date, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_bloqueios_ferias_painel(uuid[], date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.encerrar_bloqueios_ferias_painel(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.get_bloqueios_painel(uuid, date, date) IS
  'Painel Bloqueios: profissionais próprios, bloqueios no período e férias vigentes hoje.';

COMMENT ON FUNCTION public.salvar_bloqueios_dia_painel(uuid, date, text, text[]) IS
  'Painel: sobrescreve bloqueios do dia (parcial ou total), preservando férias.';

COMMENT ON FUNCTION public.salvar_bloqueios_ferias_painel(uuid[], date, date) IS
  'Painel: bloqueio de férias (dia inteiro) para profissionais selecionados.';

COMMENT ON FUNCTION public.encerrar_bloqueios_ferias_painel(uuid[]) IS
  'Painel: remove férias a partir de hoje para os profissionais selecionados.';
