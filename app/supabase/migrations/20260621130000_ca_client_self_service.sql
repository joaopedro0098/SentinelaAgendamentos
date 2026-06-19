-- Self-service do cliente: agendamentos com colaborador de CA via link do CT/AA.

-- =============================================================================
-- Helpers
-- =============================================================================

CREATE OR REPLACE FUNCTION public.client_hub_barbearia_ids_for_slug(p_slug text)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shop             record;
  _hub_barbearia_id uuid;
  _is_ca            boolean;
  _ids              uuid[];
BEGIN
  SELECT * INTO _shop
  FROM public.barbershops
  WHERE slug = trim(p_slug)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  SELECT b.id INTO _hub_barbearia_id
  FROM public.barbearias b
  WHERE b.slug = trim(p_slug)
    AND b.ativa = true
  LIMIT 1;

  _is_ca := EXISTS (
    SELECT 1
    FROM public.aggregated_accounts aa
    WHERE aa.aggregated_user_id = _shop.owner_id
      AND aa.status = 'active'::public.aggregated_account_status
  );

  IF _is_ca THEN
    IF _hub_barbearia_id IS NULL THEN
      RETURN ARRAY[]::uuid[];
    END IF;
    RETURN ARRAY[_hub_barbearia_id];
  END IF;

  SELECT array_agg(DISTINCT x.id)
  INTO _ids
  FROM (
    SELECT _hub_barbearia_id AS id
    WHERE _hub_barbearia_id IS NOT NULL
    UNION
    SELECT cb.id
    FROM public.aggregated_accounts aa
    JOIN public.barbershops cs ON cs.owner_id = aa.aggregated_user_id
    JOIN public.barbearias cb ON cb.slug = cs.slug AND cb.ativa = true
    WHERE aa.owner_user_id = _shop.owner_id
      AND aa.status = 'active'::public.aggregated_account_status
  ) x;

  RETURN COALESCE(_ids, ARRAY[]::uuid[]);
END;
$$;

COMMENT ON FUNCTION public.client_hub_barbearia_ids_for_slug(text) IS
  'IDs de barbearias visíveis pelo slug público: hub CT/AA inclui CAs ativas; CA agregada só a própria.';

GRANT EXECUTE ON FUNCTION public.client_hub_barbearia_ids_for_slug(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_client_self_service_flags_for_barbearia(p_barbearia_id uuid)
RETURNS TABLE (
  allow_public_booking boolean,
  allow_self_service boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(
      (
        SELECT os.allow_client_public_booking
        FROM public.barbearias cb
        JOIN public.barbershops cs ON cs.slug = cb.slug AND cs.owner_id = cb.owner_id
        JOIN public.aggregated_accounts aa
          ON aa.aggregated_user_id = cs.owner_id
         AND aa.status = 'active'::public.aggregated_account_status
        JOIN public.barbershops os ON os.owner_id = aa.owner_user_id
        WHERE cb.id = p_barbearia_id
      ),
      b.allow_client_public_booking,
      true
    ) AS allow_public_booking,
    COALESCE(
      (
        SELECT os.allow_client_self_service
        FROM public.barbearias cb
        JOIN public.barbershops cs ON cs.slug = cb.slug AND cs.owner_id = cb.owner_id
        JOIN public.aggregated_accounts aa
          ON aa.aggregated_user_id = cs.owner_id
         AND aa.status = 'active'::public.aggregated_account_status
        JOIN public.barbershops os ON os.owner_id = aa.owner_user_id
        WHERE cb.id = p_barbearia_id
      ),
      b.allow_client_self_service,
      true
    ) AS allow_self_service
  FROM public.barbearias b
  WHERE b.id = p_barbearia_id;
$$;

COMMENT ON FUNCTION public.get_client_self_service_flags_for_barbearia(uuid) IS
  'Permissões efetivas de self-service: CA agregada herda toggles do titular (CT/AA).';

GRANT EXECUTE ON FUNCTION public.get_client_self_service_flags_for_barbearia(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_booking_professional_for_slug(
  p_slug text,
  p_barbeiro_id uuid,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM (
      SELECT public.get_booking_professionals(trim(p_slug), p_from, p_to)::jsonb AS pros
    ) src,
    jsonb_array_elements(
      CASE
        WHEN src.pros IS NULL THEN '[]'::jsonb
        WHEN jsonb_typeof(src.pros) = 'array' THEN src.pros
        ELSE '[]'::jsonb
      END
    ) elem
    WHERE (elem->>'barbeiro_id')::uuid = p_barbeiro_id
  );
$$;

COMMENT ON FUNCTION public.is_booking_professional_for_slug(text, uuid, date, date) IS
  'True se o barbeiro faz parte da RPC unificada de profissionais do slug.';

GRANT EXECUTE ON FUNCTION public.is_booking_professional_for_slug(text, uuid, date, date) TO anon, authenticated;

-- =============================================================================
-- 1. listar_agendamentos_cliente
-- =============================================================================

DROP FUNCTION IF EXISTS public.listar_agendamentos_cliente(text, text);

CREATE OR REPLACE FUNCTION public.listar_agendamentos_cliente(_slug text, _whatsapp text)
RETURNS TABLE (
  id uuid,
  data date,
  hora time,
  duracao_minutos integer,
  barbeiro_id uuid,
  barbeiro_nome text,
  barbearia_nome text,
  cliente_nome text,
  status public.agendamento_status,
  servicos_nomes text[],
  observacao text,
  allow_client_self_service boolean,
  allow_client_public_booking boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_ids uuid[];
  _digits text;
BEGIN
  _digits := regexp_replace(COALESCE(_whatsapp, ''), '\D', '', 'g');
  IF length(_digits) < 10 THEN
    RETURN;
  END IF;

  _barbearia_ids := public.client_hub_barbearia_ids_for_slug(trim(_slug));
  IF _barbearia_ids IS NULL OR array_length(_barbearia_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.data,
    a.hora,
    a.duracao_minutos,
    a.barbeiro_id,
    br.nome AS barbeiro_nome,
    bb.nome AS barbearia_nome,
    a.cliente_nome,
    a.status,
    COALESCE(a.servicos_nomes, ARRAY[]::text[]),
    a.observacao,
    flags.allow_self_service AS allow_client_self_service,
    flags.allow_public_booking AS allow_client_public_booking
  FROM public.agendamentos a
  JOIN public.barbeiros br ON br.id = a.barbeiro_id
  JOIN public.barbearias bb ON bb.id = a.barbearia_id
  CROSS JOIN LATERAL public.get_client_self_service_flags_for_barbearia(a.barbearia_id) flags
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data >= (timezone('America/Sao_Paulo', now()))::date
    AND a.status IN (
      'confirmado'::public.agendamento_status,
      'cancelado'::public.agendamento_status
    )
    AND public.agendamento_dentro_retencao(a.data)
    AND regexp_replace(a.cliente_whatsapp, '\D', '', 'g') = _digits
  ORDER BY a.data ASC, a.hora ASC;
END;
$$;

COMMENT ON FUNCTION public.listar_agendamentos_cliente(text, text) IS
  'Lista agendamentos do cliente pelo slug do hub (CT/AA inclui CAs). Flags de self-service são efetivas (titular para CA).';

GRANT EXECUTE ON FUNCTION public.listar_agendamentos_cliente(text, text) TO anon, authenticated;

-- =============================================================================
-- 2. cancelar_agendamento_cliente
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cancelar_agendamento_cliente(
  _agendamento_id uuid,
  _slug text,
  _whatsapp text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _digits text;
  _row record;
  _flags record;
BEGIN
  _digits := regexp_replace(COALESCE(_whatsapp, ''), '\D', '', 'g');
  IF length(_digits) < 10 THEN
    RAISE EXCEPTION 'WhatsApp inválido';
  END IF;

  SELECT
    a.id,
    a.barbearia_id,
    a.data,
    a.status
  INTO _row
  FROM public.agendamentos a
  JOIN public.barbearias b ON b.id = a.barbearia_id
  WHERE a.id = _agendamento_id
    AND a.barbearia_id = ANY(public.client_hub_barbearia_ids_for_slug(trim(_slug)))
    AND b.ativa = true
    AND regexp_replace(a.cliente_whatsapp, '\D', '', 'g') = _digits;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;

  IF _row.status <> 'confirmado'::public.agendamento_status THEN
    RAISE EXCEPTION 'Agendamento não pode ser cancelado';
  END IF;

  SELECT f.allow_public_booking, f.allow_self_service
  INTO _flags
  FROM public.get_client_self_service_flags_for_barbearia(_row.barbearia_id) f;

  IF NOT _flags.allow_public_booking THEN
    RAISE EXCEPTION 'Agendamento pelo link desativado pela barbearia';
  END IF;

  IF NOT _flags.allow_self_service THEN
    RAISE EXCEPTION 'Alteração pelo cliente desativada pela barbearia';
  END IF;

  IF NOT public.cliente_pode_gerenciar_agendamento(_row.data) THEN
    RAISE EXCEPTION 'Prazo para cancelar expirou';
  END IF;

  UPDATE public.agendamentos
  SET status = 'cancelado'::public.agendamento_status
  WHERE id = _agendamento_id;
END;
$$;

-- =============================================================================
-- 3. reagendar_agendamento_cliente
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reagendar_agendamento_cliente(
  p_agendamento_id uuid,
  p_slug text,
  p_whatsapp text,
  p_data date,
  p_hora time,
  p_barbeiro_id uuid,
  p_duracao_minutos int,
  p_observacao text DEFAULT NULL,
  p_servicos_nomes text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _digits text;
  _row record;
  _flags record;
  _old_data date;
  _old_hora time;
  _target_barbearia_id uuid;
BEGIN
  _digits := regexp_replace(COALESCE(p_whatsapp, ''), '\D', '', 'g');
  IF length(_digits) < 10 THEN
    RAISE EXCEPTION 'WhatsApp inválido';
  END IF;

  SELECT
    a.id,
    a.barbearia_id,
    a.data,
    a.hora,
    a.status
  INTO _row
  FROM public.agendamentos a
  JOIN public.barbearias b ON b.id = a.barbearia_id
  WHERE a.id = p_agendamento_id
    AND a.barbearia_id = ANY(public.client_hub_barbearia_ids_for_slug(trim(p_slug)))
    AND b.ativa = true
    AND regexp_replace(a.cliente_whatsapp, '\D', '', 'g') = _digits;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;

  IF _row.status <> 'confirmado'::public.agendamento_status THEN
    RAISE EXCEPTION 'Agendamento não pode ser alterado';
  END IF;

  SELECT f.allow_public_booking, f.allow_self_service
  INTO _flags
  FROM public.get_client_self_service_flags_for_barbearia(_row.barbearia_id) f;

  IF NOT _flags.allow_public_booking THEN
    RAISE EXCEPTION 'Agendamento pelo link desativado pela barbearia';
  END IF;

  IF NOT _flags.allow_self_service THEN
    RAISE EXCEPTION 'Alteração pelo cliente desativada pela barbearia';
  END IF;

  IF NOT public.cliente_pode_gerenciar_agendamento(_row.data) THEN
    RAISE EXCEPTION 'Prazo para alterar expirou';
  END IF;

  IF NOT public.is_booking_professional_for_slug(p_slug, p_barbeiro_id, p_data, p_data) THEN
    RAISE EXCEPTION 'Colaborador inválido';
  END IF;

  SELECT br.barbearia_id INTO _target_barbearia_id
  FROM public.barbeiros br
  WHERE br.id = p_barbeiro_id
    AND br.ativo = true;

  IF _target_barbearia_id IS NULL THEN
    RAISE EXCEPTION 'Colaborador inválido';
  END IF;

  IF p_duracao_minutos IS NULL OR p_duracao_minutos < 1 THEN
    RAISE EXCEPTION 'Duração inválida';
  END IF;

  _old_data := _row.data;
  _old_hora := _row.hora;

  UPDATE public.agendamentos
  SET
    data = p_data,
    hora = p_hora,
    barbeiro_id = p_barbeiro_id,
    barbearia_id = _target_barbearia_id,
    duracao_minutos = p_duracao_minutos,
    observacao = NULLIF(trim(COALESCE(p_observacao, observacao)), ''),
    servicos_nomes = COALESCE(p_servicos_nomes, servicos_nomes),
    client_confirmed_at = NULL,
    confirmation_push_sent_at = NULL,
    reminder_push_sent_at = NULL
  WHERE id = p_agendamento_id;

  RETURN jsonb_build_object(
    'ok', true,
    'agendamento_id', p_agendamento_id,
    'old_data', _old_data,
    'old_hora', _old_hora,
    'new_data', p_data,
    'new_hora', p_hora
  );
END;
$$;
