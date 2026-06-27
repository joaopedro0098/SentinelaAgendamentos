-- Nome canonical do cliente por WhatsApp (clientes.nome), edição em Pacientes e exibição unificada.

CREATE OR REPLACE FUNCTION public.cliente_whatsapp_digits(p_whatsapp text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(COALESCE(p_whatsapp, ''), '[^0-9]', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.cliente_nome_exibicao(
  p_barbearia_id uuid,
  p_cliente_id uuid,
  p_cliente_whatsapp text,
  p_fallback text
)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT c.nome FROM public.clientes c WHERE c.id = p_cliente_id),
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

COMMENT ON FUNCTION public.cliente_nome_exibicao(uuid, uuid, text, text) IS
  'Nome exibido: cadastro em clientes (canonical) ou fallback do agendamento.';

-- Upsert: só define nome na criação; não sobrescreve nome salvo pelo profissional.
CREATE OR REPLACE FUNCTION public.upsert_cliente_por_whatsapp(
  _barbearia_id uuid,
  _whatsapp text,
  _nome text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _normalized text;
  _id uuid;
  _nome_informado text;
BEGIN
  _normalized := public.cliente_whatsapp_digits(_whatsapp);
  IF length(_normalized) = 0 THEN
    _normalized := '—';
  END IF;

  _nome_informado := NULLIF(trim(COALESCE(_nome, '')), '');

  INSERT INTO public.clientes (barbearia_id, whatsapp, nome)
  VALUES (_barbearia_id, _normalized, COALESCE(_nome_informado, 'Cliente'))
  ON CONFLICT (barbearia_id, whatsapp)
  DO UPDATE SET updated_at = now()
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_cliente_cadastro_por_whatsapp(
  p_barbearia_id uuid,
  p_whatsapp text
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _digits text;
  _row record;
BEGIN
  _digits := public.cliente_whatsapp_digits(p_whatsapp);
  IF length(_digits) < 10 THEN
    RETURN NULL;
  END IF;

  SELECT c.id, c.nome, c.whatsapp
  INTO _row
  FROM public.clientes c
  WHERE c.barbearia_id = p_barbearia_id
    AND c.whatsapp = _digits
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN json_build_object(
    'id', _row.id,
    'nome', _row.nome,
    'whatsapp', _row.whatsapp
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cliente_cadastro_por_whatsapp(uuid, text) TO anon, authenticated;

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
  _barbearia_ids uuid[];
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

  _barbearia_ids := public.painel_barbearia_ids_editaveis();

  IF coalesce(array_length(_barbearia_ids, 1), 0) = 0 THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.agendamentos a
    WHERE a.barbearia_id = ANY(_barbearia_ids)
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
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND public.cliente_whatsapp_digits(a.cliente_whatsapp) = _digits
  ON CONFLICT (barbearia_id, whatsapp)
  DO UPDATE SET nome = EXCLUDED.nome, updated_at = now();

  GET DIAGNOSTICS _updated_clientes = ROW_COUNT;

  UPDATE public.clientes c
  SET nome = _nome, updated_at = now()
  WHERE c.barbearia_id = ANY(_barbearia_ids)
    AND c.whatsapp = _digits;

  UPDATE public.agendamentos a
  SET cliente_nome = _nome
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND public.cliente_whatsapp_digits(a.cliente_whatsapp) = _digits;

  GET DIAGNOSTICS _updated_agendamentos = ROW_COUNT;

  UPDATE public.agendamentos a
  SET cliente_id = c.id
  FROM public.clientes c
  WHERE a.barbearia_id = ANY(_barbearia_ids)
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

GRANT EXECUTE ON FUNCTION public.update_paciente_nome_painel(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_agendamentos_painel(
  p_data_inicio date,
  p_data_fim    date
)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_ids                    uuid[];
  _barbearia_ids_agendamentos_edit  uuid[];
  _items                            json;
  _profissionais                    json;
  _total                            int;
  _confirmados                      int;
  _concluidos                       int;
  _aguardando                       int;
  _cancelados                       int;
  _faturamento                      bigint;
  _status_visiveis                  public.agendamento_status[] := ARRAY[
    'confirmado'::public.agendamento_status,
    'concluido'::public.agendamento_status,
    'cancelado'::public.agendamento_status,
    'nao_veio'::public.agendamento_status
  ];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF p_data_inicio IS NULL OR p_data_fim IS NULL OR p_data_fim < p_data_inicio THEN
    RETURN json_build_object('error', 'invalid_dates');
  END IF;

  _barbearia_ids := public.painel_barbearia_ids_visiveis();
  _barbearia_ids_agendamentos_edit := public.painel_barbearia_ids_agendamentos_editaveis();

  IF array_length(_barbearia_ids, 1) IS NULL OR array_length(_barbearia_ids, 1) = 0 THEN
    RETURN json_build_object(
      'items', '[]'::json,
      'profissionais', '[]'::json,
      'summary', json_build_object(
        'total', 0,
        'confirmados', 0,
        'concluidos', 0,
        'aguardando_confirmacao', 0,
        'cancelados', 0,
        'faturamento_centavos', 0
      )
    );
  END IF;

  PERFORM public.expirar_agendamentos_nao_confirmados(_barbearia_ids);

  SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.data, t.hora, t.barbeiro_nome), '[]'::json)
  INTO _items
  FROM (
    SELECT
      a.id,
      a.data,
      to_char(a.hora, 'HH24:MI') AS hora,
      public.cliente_nome_exibicao(a.barbearia_id, a.cliente_id, a.cliente_whatsapp, a.cliente_nome) AS cliente_nome,
      a.cliente_whatsapp,
      a.duracao_minutos,
      coalesce(a.servicos_nomes, ARRAY[]::text[]) AS servicos_nomes,
      a.observacao,
      a.barbeiro_id,
      coalesce(br.nome, 'Colaborador') AS barbeiro_nome,
      a.barbearia_id,
      a.confirmation_token,
      a.client_confirmed_at,
      coalesce(a.requires_client_confirmation, false) AS requires_client_confirmation,
      a.status::text AS status,
      (a.barbearia_id = ANY(_barbearia_ids_agendamentos_edit)) AS can_manage
    FROM public.agendamentos a
    LEFT JOIN public.barbeiros br ON br.id = a.barbeiro_id
    WHERE a.barbearia_id = ANY(_barbearia_ids)
      AND a.data BETWEEN p_data_inicio AND p_data_fim
      AND a.status = ANY(_status_visiveis)
  ) t;

  SELECT coalesce(json_agg(row_to_json(p) ORDER BY p.nome), '[]'::json)
  INTO _profissionais
  FROM (
    SELECT br.id, br.nome, br.barbearia_id
    FROM public.barbeiros br
    WHERE br.barbearia_id = ANY(_barbearia_ids)
      AND br.ativo = true

    UNION

    SELECT DISTINCT br.id, coalesce(br.nome, 'Colaborador'), a.barbearia_id
    FROM public.agendamentos a
    LEFT JOIN public.barbeiros br ON br.id = a.barbeiro_id
    WHERE a.barbearia_id = ANY(_barbearia_ids)
      AND a.data BETWEEN p_data_inicio AND p_data_fim
      AND a.status = ANY(_status_visiveis)
      AND NOT EXISTS (
        SELECT 1 FROM public.barbeiros bx
        WHERE bx.id = a.barbeiro_id AND bx.ativo = true
      )
  ) p;

  SELECT count(*)::int INTO _total
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = ANY(_status_visiveis);

  SELECT count(*)::int INTO _confirmados
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'confirmado'::public.agendamento_status
    AND (
      NOT coalesce(a.requires_client_confirmation, false)
      OR a.client_confirmed_at IS NOT NULL
    );

  SELECT count(*)::int INTO _concluidos
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'concluido'::public.agendamento_status;

  SELECT count(*)::int INTO _aguardando
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'confirmado'::public.agendamento_status
    AND coalesce(a.requires_client_confirmation, false)
    AND a.client_confirmed_at IS NULL;

  SELECT count(*)::int INTO _cancelados
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'cancelado'::public.agendamento_status;

  SELECT coalesce(sum(sub.faturamento), 0)
  INTO _faturamento
  FROM public.agendamentos a
  LEFT JOIN LATERAL (
    SELECT coalesce(sum(coalesce(bs.preco_centavos, 0)), 0) AS faturamento
    FROM unnest(coalesce(a.servicos_nomes, ARRAY[]::text[])) AS sn(nome)
    LEFT JOIN public.barbeiro_services bs
      ON bs.barbeiro_id = a.barbeiro_id
     AND bs.nome = sn.nome
     AND bs.ativo = true
  ) sub ON true
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND (
      a.status = 'concluido'::public.agendamento_status
      OR (
        a.status = 'confirmado'::public.agendamento_status
        AND (
          NOT coalesce(a.requires_client_confirmation, false)
          OR a.client_confirmed_at IS NOT NULL
        )
      )
    );

  RETURN json_build_object(
    'items', _items,
    'profissionais', _profissionais,
    'summary', json_build_object(
      'total', _total,
      'confirmados', _confirmados,
      'concluidos', _concluidos,
      'aguardando_confirmacao', _aguardando,
      'cancelados', _cancelados,
      'faturamento_centavos', _faturamento
    )
  );
END;
$$;

-- list_pacientes_painel: nome canonical por WhatsApp
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
          WHERE c.barbearia_id = ANY(_barbearia_ids)
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
      an.conteudo AS anotacao_conteudo,
      an.updated_at AS anotacao_updated_at,
      public.painel_pode_escrever_anotacao(a.id) AS can_write
    FROM public.agendamentos a
    JOIN public.barbeiros bb ON bb.id = a.barbeiro_id
    LEFT JOIN public.agendamento_anotacoes an ON an.agendamento_id = a.id
    WHERE a.barbearia_id = ANY(_barbearia_ids)
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
