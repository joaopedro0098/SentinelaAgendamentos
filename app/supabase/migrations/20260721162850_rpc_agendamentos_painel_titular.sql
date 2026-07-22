-- Fase H onda 2: get_agendamentos_painel — escopo titular_user_id + archived_at IS NULL.

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
  _titular                          uuid := public.painel_titular_user_id();
  _barbearia_ids                    uuid[];
  _barbearia_ids_agendamentos_edit  uuid[];
  _items                            json;
  _profissionais                    json;
  _total                            int;
  _confirmados                      int;
  _concluidos                       int;
  _aguardando                       int;
  _aguardando_pagamento             int;
  _cancelados                       int;
  _faturamento                      bigint;
  _status_visiveis                  public.agendamento_status[] := ARRAY[
    'confirmado'::public.agendamento_status,
    'concluido'::public.agendamento_status,
    'cancelado'::public.agendamento_status,
    'nao_veio'::public.agendamento_status,
    'aguardando_pagamento'::public.agendamento_status
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
        'aguardando_pagamento', 0,
        'cancelados', 0,
        'faturamento_centavos', 0
      )
    );
  END IF;

  PERFORM public.expirar_agendamentos_nao_confirmados(_barbearia_ids);
  PERFORM public.expirar_agendamentos_aguardando_pagamento();

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
      a.valor_base_centavos,
      a.valor_pago_centavos,
      a.valor_restante_centavos,
      a.payment_expires_at,
      a.payment_status::text AS payment_status,
      CASE
        WHEN a.barbearia_id IS NULL THEN
          a.titular_user_id = _titular AND auth.uid() = _titular
        ELSE
          a.barbearia_id = ANY(_barbearia_ids_agendamentos_edit)
      END AS can_manage,
      EXISTS (
        SELECT 1 FROM public.alertas_agendamento al
        WHERE al.agendamento_id = a.id AND al.status = 'pendente'
      ) AS has_pending_alert
    FROM public.agendamentos a
    LEFT JOIN public.barbeiros br ON br.id = a.barbeiro_id
    WHERE a.titular_user_id = _titular
      AND a.archived_at IS NULL
      AND a.data BETWEEN p_data_inicio AND p_data_fim
      AND a.status = ANY(_status_visiveis)
      AND (
        a.status <> 'aguardando_pagamento'::public.agendamento_status
        OR public.public_booking_hold_blocks_slot(a)
      )
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
    WHERE a.titular_user_id = _titular
      AND a.archived_at IS NULL
      AND a.data BETWEEN p_data_inicio AND p_data_fim
      AND a.status = ANY(_status_visiveis)
      AND (
        a.status <> 'aguardando_pagamento'::public.agendamento_status
        OR public.public_booking_hold_blocks_slot(a)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.barbeiros bx
        WHERE bx.id = a.barbeiro_id AND bx.ativo = true
      )
  ) p;

  SELECT count(*)::int INTO _total
  FROM public.agendamentos a
  WHERE a.titular_user_id = _titular
    AND a.archived_at IS NULL
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = ANY(_status_visiveis)
    AND (
      a.status <> 'aguardando_pagamento'::public.agendamento_status
      OR public.public_booking_hold_blocks_slot(a)
    );

  SELECT count(*)::int INTO _confirmados
  FROM public.agendamentos a
  WHERE a.titular_user_id = _titular
    AND a.archived_at IS NULL
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'confirmado'::public.agendamento_status
    AND (
      NOT coalesce(a.requires_client_confirmation, false)
      OR a.client_confirmed_at IS NOT NULL
    );

  SELECT count(*)::int INTO _concluidos
  FROM public.agendamentos a
  WHERE a.titular_user_id = _titular
    AND a.archived_at IS NULL
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'concluido'::public.agendamento_status;

  SELECT count(*)::int INTO _aguardando
  FROM public.agendamentos a
  WHERE a.titular_user_id = _titular
    AND a.archived_at IS NULL
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'confirmado'::public.agendamento_status
    AND coalesce(a.requires_client_confirmation, false)
    AND a.client_confirmed_at IS NULL;

  SELECT count(*)::int INTO _aguardando_pagamento
  FROM public.agendamentos a
  WHERE a.titular_user_id = _titular
    AND a.archived_at IS NULL
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'aguardando_pagamento'::public.agendamento_status
    AND public.public_booking_hold_blocks_slot(a);

  SELECT count(*)::int INTO _cancelados
  FROM public.agendamentos a
  WHERE a.titular_user_id = _titular
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
  WHERE a.titular_user_id = _titular
    AND a.archived_at IS NULL
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
      'aguardando_pagamento', _aguardando_pagamento,
      'cancelados', _cancelados,
      'faturamento_centavos', _faturamento
    )
  );
END;
$$;

COMMENT ON FUNCTION public.get_agendamentos_painel(date, date) IS
  'Painel Agendamentos: escopo titular_user_id + archived_at IS NULL; can_manage híbrido para órfãos (barbearia_id NULL).';

GRANT EXECUTE ON FUNCTION public.get_agendamentos_painel(date, date) TO authenticated;
