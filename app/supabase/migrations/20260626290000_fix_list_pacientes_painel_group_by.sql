-- Corrige list_pacientes_painel: subquery não pode referenciar a.cliente_whatsapp fora do GROUP BY.

CREATE OR REPLACE FUNCTION public.list_pacientes_painel(p_barbeiro_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_ids uuid[];
  _pacientes json;
  _profissionais json;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  _barbearia_ids := public.painel_barbearia_ids_pacientes_visiveis();

  IF coalesce(array_length(_barbearia_ids, 1), 0) = 0 THEN
    RETURN json_build_object('pacientes', '[]'::json, 'profissionais', '[]'::json);
  END IF;

  SELECT coalesce(json_agg(row_to_json(p) ORDER BY p.ultimo_atendimento DESC, p.cliente_nome), '[]'::json)
  INTO _pacientes
  FROM (
    WITH scoped AS (
      SELECT
        regexp_replace(a.cliente_whatsapp, '[^0-9]', '', 'g') AS whatsapp_digits,
        a.cliente_nome,
        a.data,
        a.hora,
        a.id AS agendamento_id
      FROM public.agendamentos a
      WHERE a.barbearia_id = ANY(_barbearia_ids)
        AND a.status = 'concluido'::public.agendamento_status
        AND length(regexp_replace(a.cliente_whatsapp, '[^0-9]', '', 'g')) >= 10
        AND (p_barbeiro_id IS NULL OR a.barbeiro_id = p_barbeiro_id)
    ),
    with_anot AS (
      SELECT
        s.whatsapp_digits,
        s.cliente_nome,
        s.data,
        s.hora,
        an.id AS anotacao_id
      FROM scoped s
      LEFT JOIN public.agendamento_anotacoes an ON an.agendamento_id = s.agendamento_id
    )
    SELECT
      g.whatsapp_digits,
      (
        SELECT w.cliente_nome
        FROM with_anot w
        WHERE w.whatsapp_digits = g.whatsapp_digits
        ORDER BY w.data DESC, w.hora DESC
        LIMIT 1
      ) AS cliente_nome,
      max(g.data) AS ultimo_atendimento,
      count(*)::int AS total_concluidos,
      count(g.anotacao_id)::int AS total_anotacoes
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
          AND ag.status = 'concluido'::public.agendamento_status
      )
  ) pr;

  RETURN json_build_object(
    'pacientes', _pacientes,
    'profissionais', _profissionais
  );
END;
$$;
