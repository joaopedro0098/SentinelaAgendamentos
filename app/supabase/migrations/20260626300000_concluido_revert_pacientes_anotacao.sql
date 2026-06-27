-- Reverter concluído → confirmado/não confirmado (hoje) sem apagar anotações.
-- Pacientes: manter histórico com anotação mesmo se status voltar.

CREATE OR REPLACE FUNCTION public.alterar_agendamento_painel(
  p_agendamento_id uuid,
  p_acao text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_id uuid;
  _status public.agendamento_status;
  _confirmed_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF p_acao NOT IN ('confirmar', 'nao_confirmado', 'cancelar') THEN
    RAISE EXCEPTION 'Ação inválida';
  END IF;

  SELECT a.barbearia_id, a.status, a.client_confirmed_at
  INTO _barbearia_id, _status, _confirmed_at
  FROM public.agendamentos a
  WHERE a.id = p_agendamento_id;

  IF _barbearia_id IS NULL THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;

  IF NOT public.painel_pode_gerenciar_agendamento(_barbearia_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar este agendamento';
  END IF;

  IF _status = 'nao_veio'::public.agendamento_status THEN
    RAISE EXCEPTION 'Use o menu de ações para agendamentos marcados como faltou';
  END IF;

  IF p_acao = 'cancelar' THEN
    IF _status <> 'confirmado'::public.agendamento_status THEN
      RAISE EXCEPTION 'Só é possível cancelar agendamentos confirmados';
    END IF;

    UPDATE public.agendamentos
    SET
      status = 'cancelado'::public.agendamento_status,
      cancelado_por = 'profissional'
    WHERE id = p_agendamento_id;

    RETURN json_build_object(
      'status', 'cancelado',
      'client_confirmed_at', _confirmed_at
    );
  END IF;

  IF p_acao = 'confirmar' THEN
    UPDATE public.agendamentos
    SET
      status = 'confirmado'::public.agendamento_status,
      client_confirmed_at = COALESCE(client_confirmed_at, now()),
      cancelado_por = NULL
    WHERE id = p_agendamento_id
    RETURNING client_confirmed_at INTO _confirmed_at;

    RETURN json_build_object(
      'status', 'confirmado',
      'client_confirmed_at', _confirmed_at
    );
  END IF;

  -- nao_confirmado (inclui reversão de concluído)
  UPDATE public.agendamentos
  SET
    status = 'confirmado'::public.agendamento_status,
    client_confirmed_at = NULL,
    cancelado_por = NULL
  WHERE id = p_agendamento_id;

  RETURN json_build_object(
    'status', 'confirmado',
    'client_confirmed_at', NULL
  );
END;
$$;

COMMENT ON FUNCTION public.alterar_agendamento_painel(uuid, text) IS
  'Painel: confirmar, marcar não confirmado ou cancelar. Permite reverter concluído para confirmado (anotações permanecem).';

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
        a.id AS agendamento_id,
        a.status
      FROM public.agendamentos a
      WHERE a.barbearia_id = ANY(_barbearia_ids)
        AND length(regexp_replace(a.cliente_whatsapp, '[^0-9]', '', 'g')) >= 10
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
      (
        SELECT w.cliente_nome
        FROM with_anot w
        WHERE w.whatsapp_digits = g.whatsapp_digits
        ORDER BY w.data DESC, w.hora DESC
        LIMIT 1
      ) AS cliente_nome,
      max(g.data) AS ultimo_atendimento,
      count(*) FILTER (WHERE g.status = 'concluido'::public.agendamento_status)::int AS total_concluidos,
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

  _digits := regexp_replace(COALESCE(p_whatsapp_digits, ''), '[^0-9]', '', 'g');
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
      a.cliente_nome,
      a.cliente_whatsapp,
      a.barbearia_id,
      a.status,
      bb.nome AS barbeiro_nome,
      to_jsonb(coalesce(a.servicos_nomes, ARRAY[]::text[])) AS servicos_nomes,
      an.conteudo AS anotacao_conteudo,
      an.updated_at AS anotacao_updated_at,
      public.painel_pode_escrever_anotacao(a.id) AS can_write
    FROM public.agendamentos a
    JOIN public.barbeiros bb ON bb.id = a.barbeiro_id
    LEFT JOIN public.agendamento_anotacoes an ON an.agendamento_id = a.id
    WHERE a.barbearia_id = ANY(_barbearia_ids)
      AND regexp_replace(a.cliente_whatsapp, '[^0-9]', '', 'g') = _digits
      AND (p_barbeiro_id IS NULL OR a.barbeiro_id = p_barbeiro_id)
      AND (
        a.status = 'concluido'::public.agendamento_status
        OR an.id IS NOT NULL
      )
  ) x;

  RETURN json_build_object('items', _items);
END;
$$;
