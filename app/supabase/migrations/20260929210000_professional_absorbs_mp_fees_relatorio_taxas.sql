-- Taxa MP sempre absorvida pelo profissional (cliente paga só o valor base).

CREATE OR REPLACE FUNCTION public.apply_mp_pass_fee_centavos(
  p_charge_centavos int,
  p_method text,
  p_installments int DEFAULT 1,
  p_pass_fee_card boolean DEFAULT false,
  p_pass_fee_pix boolean DEFAULT false
)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN coalesce(p_charge_centavos, 0);
END;
$$;

COMMENT ON FUNCTION public.apply_mp_pass_fee_centavos(int, text, int, boolean, boolean) IS
  'Repasse ao cliente desativado: retorna sempre o valor base (taxa absorvida pelo profissional).';

CREATE OR REPLACE FUNCTION public.estimate_mp_absorbed_fee_centavos(
  p_charge_base_centavos int,
  p_installment_count smallint DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  _base int := coalesce(p_charge_base_centavos, 0);
  _fee_bps int := 0;
  _inst int;
  _with_fee int;
BEGIN
  IF _base <= 0 THEN
    RETURN 0;
  END IF;

  IF p_installment_count IS NOT NULL THEN
    _inst := greatest(p_installment_count::int, 1);
    _fee_bps := 498;
    IF _inst > 1 THEN
      _fee_bps := _fee_bps + (_inst - 1) * 150;
    END IF;
  ELSE
    _fee_bps := 99;
  END IF;

  _with_fee := round(_base::numeric * (10000 + _fee_bps) / 10000.0)::int;
  RETURN greatest(0, _with_fee - _base);
END;
$$;

COMMENT ON FUNCTION public.estimate_mp_absorbed_fee_centavos(int, smallint) IS
  'Estimativa da taxa MP absorvida pelo profissional (cartão se installment_count preenchido, senão Pix).';

GRANT EXECUTE ON FUNCTION public.estimate_mp_absorbed_fee_centavos(int, smallint) TO authenticated;

UPDATE public.barbershops
SET payment_pass_fee_card = false, payment_pass_fee_pix = false
WHERE payment_pass_fee_card OR payment_pass_fee_pix;

UPDATE public.cliente_pagamento_prefs
SET payment_pass_fee_card = false, payment_pass_fee_pix = false
WHERE payment_pass_fee_card OR payment_pass_fee_pix;

-- Relatórios: taxas MP por agendamento, por profissional e total do período.

CREATE OR REPLACE FUNCTION public.get_relatorio_agendamentos(
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
  _barbearia_ids uuid[];
  _total         int;
  _total_faltas  int;
  _total_cancel  int;
  _faturamento   bigint;
  _taxas_totais  bigint;
  _por_barbeiro  json;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF p_data_inicio IS NULL OR p_data_fim IS NULL THEN
    RETURN json_build_object('error', 'invalid_dates');
  END IF;

  _barbearia_ids := public.painel_barbearia_ids_visiveis();

  IF coalesce(array_length(_barbearia_ids, 1), 0) > 0 THEN
    PERFORM public.expirar_agendamentos_nao_confirmados(_barbearia_ids);
  END IF;

  SELECT count(*)::int
  INTO _total
  FROM public.agendamentos a
  WHERE a.titular_user_id = public.painel_titular_user_id()
    AND a.archived_at IS NULL
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'concluido'::public.agendamento_status;

  SELECT count(*)::int
  INTO _total_faltas
  FROM public.agendamentos a
  WHERE a.titular_user_id = public.painel_titular_user_id()
    AND a.archived_at IS NULL
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'nao_veio'::public.agendamento_status;

  SELECT count(*)::int
  INTO _total_cancel
  FROM public.agendamentos a
  WHERE a.titular_user_id = public.painel_titular_user_id()
    AND a.archived_at IS NULL
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
  WHERE a.titular_user_id = public.painel_titular_user_id()
    AND a.archived_at IS NULL
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'concluido'::public.agendamento_status;

  SELECT coalesce(sum(
    public.estimate_mp_absorbed_fee_centavos(
      coalesce(a.valor_cobranca_base_centavos, a.valor_pago_centavos, 0),
      a.installment_count
    )
  ), 0)
  INTO _taxas_totais
  FROM public.agendamentos a
  WHERE a.titular_user_id = public.painel_titular_user_id()
    AND a.archived_at IS NULL
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'concluido'::public.agendamento_status
    AND a.mp_payment_id IS NOT NULL;

  IF coalesce(array_length(_barbearia_ids, 1), 0) > 0 THEN
    SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.total DESC, t.faltas DESC, t.cancelamentos DESC), '[]'::json)
    INTO _por_barbeiro
    FROM (
      SELECT
        br.id AS barbeiro_id,
        br.nome AS barbeiro_nome,
        count(*) FILTER (
          WHERE a.status = 'concluido'::public.agendamento_status
        )::int AS total,
        count(*) FILTER (
          WHERE a.status = 'nao_veio'::public.agendamento_status
        )::int AS faltas,
        count(*) FILTER (
          WHERE a.status = 'cancelado'::public.agendamento_status
        )::int AS cancelamentos,
        coalesce(sum(
          CASE
            WHEN a.status = 'concluido'::public.agendamento_status AND a.mp_payment_id IS NOT NULL THEN
              public.estimate_mp_absorbed_fee_centavos(
                coalesce(a.valor_cobranca_base_centavos, a.valor_pago_centavos, 0),
                a.installment_count
              )
            ELSE 0
          END
        ), 0)::bigint AS taxas_mp_centavos
      FROM public.barbeiros br
      LEFT JOIN public.agendamentos a
        ON a.barbeiro_id = br.id
       AND a.titular_user_id = public.painel_titular_user_id()
       AND a.archived_at IS NULL
       AND a.data BETWEEN p_data_inicio AND p_data_fim
       AND a.status IN (
         'concluido'::public.agendamento_status,
         'nao_veio'::public.agendamento_status,
         'cancelado'::public.agendamento_status
       )
      WHERE br.barbearia_id = ANY(_barbearia_ids)
      GROUP BY br.id, br.nome
      HAVING
        count(*) FILTER (WHERE a.status = 'concluido'::public.agendamento_status) > 0
        OR count(*) FILTER (WHERE a.status = 'nao_veio'::public.agendamento_status) > 0
        OR count(*) FILTER (WHERE a.status = 'cancelado'::public.agendamento_status) > 0
    ) t;
  ELSE
    _por_barbeiro := '[]'::json;
  END IF;

  RETURN json_build_object(
    'total', _total,
    'total_faltas', _total_faltas,
    'total_cancelamentos', _total_cancel,
    'faturamento_total_centavos', _faturamento,
    'taxas_mp_totais_centavos', _taxas_totais,
    'por_barbeiro', _por_barbeiro
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_relatorio_detalhes_colaborador(
  p_data_inicio date,
  p_data_fim date,
  p_barbeiro_id uuid
)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_ids uuid[];
  _items json;
  _faltas json;
  _cancelamentos json;
  _faturamento_total bigint;
  _taxas_mp_total bigint;
  _horas_trabalhadas bigint;
  _faltas_total int;
  _cancelamentos_total int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF p_data_inicio IS NULL OR p_data_fim IS NULL OR p_barbeiro_id IS NULL THEN
    RETURN json_build_object('error', 'invalid_params');
  END IF;

  _barbearia_ids := public.painel_barbearia_ids_visiveis();

  IF coalesce(array_length(_barbearia_ids, 1), 0) > 0 THEN
    PERFORM public.expirar_agendamentos_nao_confirmados(_barbearia_ids);
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1
      FROM public.barbeiros br
      WHERE br.id = p_barbeiro_id
        AND br.barbearia_id = ANY(_barbearia_ids)
    )
    OR EXISTS (
      SELECT 1
      FROM public.agendamentos a
      WHERE a.barbeiro_id = p_barbeiro_id
        AND a.titular_user_id = public.painel_titular_user_id()
        AND a.archived_at IS NULL
        AND a.barbearia_id IS NULL
        AND a.titular_user_id = auth.uid()
    )
  ) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  SELECT
    coalesce(sum(sub.faturamento), 0),
    coalesce(sum(a.duracao_minutos), 0)
  INTO _faturamento_total, _horas_trabalhadas
  FROM public.agendamentos a
  LEFT JOIN LATERAL (
    SELECT coalesce(sum(coalesce(bs.preco_centavos, 0)), 0) AS faturamento
    FROM unnest(coalesce(a.servicos_nomes, ARRAY[]::text[])) AS sn(nome)
    LEFT JOIN public.barbeiro_services bs
      ON bs.barbeiro_id = a.barbeiro_id
     AND bs.nome = sn.nome
     AND bs.ativo = true
  ) sub ON true
  WHERE a.barbeiro_id = p_barbeiro_id
    AND a.titular_user_id = public.painel_titular_user_id()
    AND a.archived_at IS NULL
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'concluido'::public.agendamento_status;

  SELECT coalesce(sum(
    public.estimate_mp_absorbed_fee_centavos(
      coalesce(a.valor_cobranca_base_centavos, a.valor_pago_centavos, 0),
      a.installment_count
    )
  ), 0)
  INTO _taxas_mp_total
  FROM public.agendamentos a
  WHERE a.barbeiro_id = p_barbeiro_id
    AND a.titular_user_id = public.painel_titular_user_id()
    AND a.archived_at IS NULL
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'concluido'::public.agendamento_status
    AND a.mp_payment_id IS NOT NULL;

  SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.data DESC, t.hora DESC), '[]'::json)
  INTO _items
  FROM (
    SELECT
      a.id,
      a.data,
      to_char(a.hora, 'HH24:MI') AS hora,
      a.cliente_nome,
      a.cliente_whatsapp,
      a.duracao_minutos,
      CASE
        WHEN a.mp_payment_id IS NULL THEN 0
        ELSE public.estimate_mp_absorbed_fee_centavos(
          coalesce(a.valor_cobranca_base_centavos, a.valor_pago_centavos, 0),
          a.installment_count
        )
      END AS mp_taxa_centavos,
      CASE
        WHEN a.mp_payment_id IS NULL THEN NULL
        WHEN a.installment_count IS NOT NULL THEN 'card'
        ELSE 'pix'
      END AS mp_pagamento_metodo,
      (
        SELECT coalesce(
          json_agg(
            json_build_object(
              'nome', sn.nome,
              'preco_centavos', coalesce(bs.preco_centavos, 0)
            )
            ORDER BY sn.ord
          ),
          '[]'::json
        )
        FROM unnest(coalesce(a.servicos_nomes, ARRAY[]::text[])) WITH ORDINALITY AS sn(nome, ord)
        LEFT JOIN public.barbeiro_services bs
          ON bs.barbeiro_id = a.barbeiro_id
         AND bs.nome = sn.nome
         AND bs.ativo = true
      ) AS servicos
    FROM public.agendamentos a
    WHERE a.barbeiro_id = p_barbeiro_id
      AND a.titular_user_id = public.painel_titular_user_id()
      AND a.archived_at IS NULL
      AND a.data BETWEEN p_data_inicio AND p_data_fim
      AND a.status = 'concluido'::public.agendamento_status
  ) t;

  SELECT count(*)::int
  INTO _faltas_total
  FROM public.agendamentos a
  WHERE a.barbeiro_id = p_barbeiro_id
    AND a.titular_user_id = public.painel_titular_user_id()
    AND a.archived_at IS NULL
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'nao_veio'::public.agendamento_status;

  SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.data DESC, t.hora DESC), '[]'::json)
  INTO _faltas
  FROM (
    SELECT
      a.id,
      a.data,
      to_char(a.hora, 'HH24:MI') AS hora,
      a.cliente_nome,
      a.cliente_whatsapp,
      (
        SELECT coalesce(
          json_agg(
            json_build_object(
              'nome', sn.nome,
              'preco_centavos', coalesce(bs.preco_centavos, 0)
            )
            ORDER BY sn.ord
          ),
          '[]'::json
        )
        FROM unnest(coalesce(a.servicos_nomes, ARRAY[]::text[])) WITH ORDINALITY AS sn(nome, ord)
        LEFT JOIN public.barbeiro_services bs
          ON bs.barbeiro_id = a.barbeiro_id
         AND bs.nome = sn.nome
         AND bs.ativo = true
      ) AS servicos
    FROM public.agendamentos a
    WHERE a.barbeiro_id = p_barbeiro_id
      AND a.titular_user_id = public.painel_titular_user_id()
      AND a.archived_at IS NULL
      AND a.data BETWEEN p_data_inicio AND p_data_fim
      AND a.status = 'nao_veio'::public.agendamento_status
  ) t;

  SELECT count(*)::int
  INTO _cancelamentos_total
  FROM public.agendamentos a
  WHERE a.barbeiro_id = p_barbeiro_id
    AND a.titular_user_id = public.painel_titular_user_id()
    AND a.archived_at IS NULL
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'cancelado'::public.agendamento_status;

  SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.data DESC, t.hora DESC), '[]'::json)
  INTO _cancelamentos
  FROM (
    SELECT
      a.id,
      a.data,
      to_char(a.hora, 'HH24:MI') AS hora,
      a.cliente_nome,
      a.cliente_whatsapp,
      public.agendamento_cancelado_por(a.cancelado_por, a.origem) AS cancelado_por,
      (
        SELECT coalesce(
          json_agg(
            json_build_object(
              'nome', sn.nome,
              'preco_centavos', coalesce(bs.preco_centavos, 0)
            )
            ORDER BY sn.ord
          ),
          '[]'::json
        )
        FROM unnest(coalesce(a.servicos_nomes, ARRAY[]::text[])) WITH ORDINALITY AS sn(nome, ord)
        LEFT JOIN public.barbeiro_services bs
          ON bs.barbeiro_id = a.barbeiro_id
         AND bs.nome = sn.nome
         AND bs.ativo = true
      ) AS servicos
    FROM public.agendamentos a
    WHERE a.barbeiro_id = p_barbeiro_id
      AND a.titular_user_id = public.painel_titular_user_id()
      AND a.archived_at IS NULL
      AND a.data BETWEEN p_data_inicio AND p_data_fim
      AND a.status = 'cancelado'::public.agendamento_status
  ) t;

  RETURN json_build_object(
    'items', _items,
    'faltas', _faltas,
    'cancelamentos', _cancelamentos,
    'faltas_total', coalesce(_faltas_total, 0),
    'cancelamentos_total', coalesce(_cancelamentos_total, 0),
    'faturamento_total_centavos', _faturamento_total,
    'taxas_mp_total_centavos', _taxas_mp_total,
    'horas_trabalhadas_minutos', _horas_trabalhadas
  );
END;
$$;
