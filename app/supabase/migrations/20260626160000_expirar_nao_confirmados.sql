-- Agendamentos não confirmados em dias passados viram falta (nao_veio) automaticamente.

CREATE OR REPLACE FUNCTION public.expirar_agendamentos_nao_confirmados(p_barbearia_ids uuid[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hoje date;
  _count int;
BEGIN
  _hoje := (timezone('America/Sao_Paulo', now()))::date;

  UPDATE public.agendamentos a
  SET status = 'nao_veio'::public.agendamento_status
  WHERE a.data < _hoje
    AND a.status = 'confirmado'::public.agendamento_status
    AND coalesce(a.requires_client_confirmation, false)
    AND a.client_confirmed_at IS NULL
    AND (p_barbearia_ids IS NULL OR a.barbearia_id = ANY(p_barbearia_ids));

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expirar_agendamentos_nao_confirmados(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.expirar_agendamentos_nao_confirmados(uuid[]) IS
  'Marca como nao_veio agendamentos não confirmados pelo cliente em dias anteriores a hoje (SP).';

CREATE OR REPLACE FUNCTION public.expirar_agendamentos_nao_confirmados_painel()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_ids uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;

  SELECT array_agg(DISTINCT b.id)
  INTO _barbearia_ids
  FROM public.barbearias b
  JOIN public.barbershops s ON s.slug = b.slug
  WHERE
    s.owner_id = auth.uid()
    OR (
      NOT EXISTS (
        SELECT 1 FROM public.aggregated_accounts aa
        WHERE aa.aggregated_user_id = auth.uid()
          AND aa.status = 'active'::public.aggregated_account_status
      )
      AND EXISTS (
        SELECT 1 FROM public.aggregated_accounts aa
        WHERE aa.owner_user_id = auth.uid()
          AND aa.aggregated_user_id = s.owner_id
          AND aa.status = 'active'::public.aggregated_account_status
      )
    );

  IF _barbearia_ids IS NULL OR array_length(_barbearia_ids, 1) = 0 THEN
    RETURN 0;
  END IF;

  RETURN public.expirar_agendamentos_nao_confirmados(_barbearia_ids);
END;
$$;

GRANT EXECUTE ON FUNCTION public.expirar_agendamentos_nao_confirmados_painel() TO authenticated;

COMMENT ON FUNCTION public.expirar_agendamentos_nao_confirmados_painel() IS
  'Painel: expira não confirmados das barbearias acessíveis ao usuário autenticado.';

-- Reverter falta → confirmado (preserva presença; não re-expira como falta).
CREATE OR REPLACE FUNCTION public.reverter_falta_agendamento_painel(p_agendamento_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_id uuid;
  _data date;
  _hoje date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  _hoje := (timezone('America/Sao_Paulo', now()))::date;

  SELECT a.barbearia_id, a.data
  INTO _barbearia_id, _data
  FROM public.agendamentos a
  WHERE a.id = p_agendamento_id
    AND a.status = 'nao_veio'::public.agendamento_status;

  IF _barbearia_id IS NULL THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;

  IF _data >= _hoje THEN
    RAISE EXCEPTION 'Só é possível reverter falta em agendamentos de dias anteriores';
  END IF;

  IF NOT public.painel_pode_gerenciar_agendamento(_barbearia_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar este agendamento';
  END IF;

  UPDATE public.agendamentos
  SET
    status = 'confirmado'::public.agendamento_status,
    client_confirmed_at = COALESCE(client_confirmed_at, now())
  WHERE id = p_agendamento_id;
END;
$$;

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
  _barbearia_ids uuid[];
  _items         json;
  _profissionais json;
  _total         int;
  _confirmados   int;
  _aguardando    int;
  _cancelados    int;
  _faturamento   bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF p_data_inicio IS NULL OR p_data_fim IS NULL OR p_data_fim < p_data_inicio THEN
    RETURN json_build_object('error', 'invalid_dates');
  END IF;

  SELECT array_agg(DISTINCT b.id)
  INTO _barbearia_ids
  FROM public.barbearias b
  JOIN public.barbershops s ON s.slug = b.slug
  WHERE
    s.owner_id = auth.uid()
    OR (
      NOT EXISTS (
        SELECT 1 FROM public.aggregated_accounts aa
        WHERE aa.aggregated_user_id = auth.uid()
          AND aa.status = 'active'::public.aggregated_account_status
      )
      AND EXISTS (
        SELECT 1 FROM public.aggregated_accounts aa
        WHERE aa.owner_user_id = auth.uid()
          AND aa.aggregated_user_id = s.owner_id
          AND aa.status = 'active'::public.aggregated_account_status
      )
    );

  IF _barbearia_ids IS NULL OR array_length(_barbearia_ids, 1) = 0 THEN
    RETURN json_build_object(
      'items', '[]'::json,
      'profissionais', '[]'::json,
      'summary', json_build_object(
        'total', 0,
        'confirmados', 0,
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
      a.cliente_nome,
      a.cliente_whatsapp,
      a.duracao_minutos,
      coalesce(a.servicos_nomes, ARRAY[]::text[]) AS servicos_nomes,
      a.observacao,
      a.barbeiro_id,
      br.nome AS barbeiro_nome,
      a.barbearia_id,
      a.confirmation_token,
      a.client_confirmed_at,
      coalesce(a.requires_client_confirmation, false) AS requires_client_confirmation,
      a.status::text AS status
    FROM public.agendamentos a
    JOIN public.barbeiros br ON br.id = a.barbeiro_id
    WHERE a.barbearia_id = ANY(_barbearia_ids)
      AND a.data BETWEEN p_data_inicio AND p_data_fim
      AND a.status IN (
        'confirmado'::public.agendamento_status,
        'cancelado'::public.agendamento_status,
        'nao_veio'::public.agendamento_status
      )
  ) t;

  SELECT coalesce(json_agg(row_to_json(p) ORDER BY p.nome), '[]'::json)
  INTO _profissionais
  FROM (
    SELECT br.id, br.nome, br.barbearia_id
    FROM public.barbeiros br
    WHERE br.barbearia_id = ANY(_barbearia_ids)
      AND br.ativo = true
  ) p;

  SELECT count(*)::int
  INTO _total
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status IN (
      'confirmado'::public.agendamento_status,
      'cancelado'::public.agendamento_status,
      'nao_veio'::public.agendamento_status
    );

  SELECT count(*)::int
  INTO _confirmados
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'confirmado'::public.agendamento_status
    AND (
      NOT coalesce(a.requires_client_confirmation, false)
      OR a.client_confirmed_at IS NOT NULL
    );

  SELECT count(*)::int
  INTO _aguardando
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'confirmado'::public.agendamento_status
    AND coalesce(a.requires_client_confirmation, false)
    AND a.client_confirmed_at IS NULL;

  SELECT count(*)::int
  INTO _cancelados
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
    AND a.status = 'confirmado'::public.agendamento_status
    AND (
      NOT coalesce(a.requires_client_confirmation, false)
      OR a.client_confirmed_at IS NOT NULL
    );

  RETURN json_build_object(
    'items', _items,
    'profissionais', _profissionais,
    'summary', json_build_object(
      'total', _total,
      'confirmados', _confirmados,
      'aguardando_confirmacao', _aguardando,
      'cancelados', _cancelados,
      'faturamento_centavos', _faturamento
    )
  );
END;
$$;

-- Cron diário à meia-noite (America/Sao_Paulo = 03:00 UTC).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('expirar-nao-confirmados-daily');
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      'expirar-nao-confirmados-daily',
      '0 3 * * *',
      'SELECT public.expirar_agendamentos_nao_confirmados(NULL);'
    );

    RAISE NOTICE 'Cron expirar-nao-confirmados-daily agendado (03:00 UTC = 00:00 America/Sao_Paulo).';
  ELSE
    RAISE NOTICE 'pg_cron indisponível; expiração ocorre ao abrir o painel de agendamentos.';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Falha ao agendar cron expirar-nao-confirmados: %', SQLERRM;
END;
$$;
