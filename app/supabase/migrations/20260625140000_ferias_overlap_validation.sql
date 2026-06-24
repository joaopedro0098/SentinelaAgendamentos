-- Impede salvar férias sobre período em que o profissional já está de férias.

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
  _nomes text[];
  _msg text;
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

  SELECT array_agg(s.name ORDER BY s.name)
  INTO _nomes
  FROM unnest(p_barbeiro_ids) AS bid
  JOIN public.barbeiros br ON br.id = bid
  JOIN public.staff s ON s.id = br.staff_id
  WHERE EXISTS (
    SELECT 1
    FROM public.bloqueios bl
    WHERE bl.barbeiro_id = bid
      AND bl.motivo = 'ferias'
      AND bl.hora_inicio IS NULL
      AND bl.hora_fim IS NULL
      AND bl.data BETWEEN p_data_inicio AND p_data_fim
  );

  IF _nomes IS NOT NULL AND cardinality(_nomes) > 0 THEN
    IF cardinality(_nomes) = 1 THEN
      _msg := format('Colaborador %s ainda está de férias.', _nomes[1]);
    ELSIF cardinality(_nomes) = 2 THEN
      _msg := format('Colaboradores %s e %s ainda estão de férias.', _nomes[1], _nomes[2]);
    ELSE
      _msg := format(
        'Colaboradores %s e %s ainda estão de férias.',
        array_to_string(_nomes[1:cardinality(_nomes) - 1], ', '),
        _nomes[cardinality(_nomes)]
      );
    END IF;
    RAISE EXCEPTION '%', _msg;
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

COMMENT ON FUNCTION public.salvar_bloqueios_ferias_painel(uuid[], date, date) IS
  'Painel: bloqueio de férias (dia inteiro). Rejeita sobreposição com férias já registradas.';
