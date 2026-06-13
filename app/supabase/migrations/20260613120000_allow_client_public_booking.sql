-- Toggle "Cliente agenda pelo link": bloqueia agendamento/alteração/cancelamento pelo link público.

ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS allow_client_public_booking boolean NOT NULL DEFAULT true;

ALTER TABLE public.barbearias
  ADD COLUMN IF NOT EXISTS allow_client_public_booking boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.barbershops.allow_client_public_booking IS
  'Se true, clientes podem agendar pelo link público. Se false, só consultam agendamentos.';
COMMENT ON COLUMN public.barbearias.allow_client_public_booking IS
  'Espelho da configuração da barbershop para agenda pública.';

UPDATE public.barbearias b
SET allow_client_public_booking = bs.allow_client_public_booking
FROM public.barbershops bs
WHERE bs.slug = b.slug;

CREATE OR REPLACE FUNCTION public.set_allow_client_public_booking(p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _slug text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT bs.slug INTO _slug
  FROM public.barbershops bs
  WHERE bs.owner_id = auth.uid()
  LIMIT 1;

  IF _slug IS NULL THEN
    RAISE EXCEPTION 'Barbearia não encontrada';
  END IF;

  UPDATE public.barbershops
  SET allow_client_public_booking = p_enabled
  WHERE slug = _slug AND owner_id = auth.uid();

  UPDATE public.barbearias
  SET allow_client_public_booking = p_enabled, updated_at = now()
  WHERE slug = _slug;
END;
$$;

COMMENT ON FUNCTION public.set_allow_client_public_booking(boolean) IS
  'Painel: ativa/desativa agendamento pelo link público (barbershops + barbearias).';

GRANT EXECUTE ON FUNCTION public.set_allow_client_public_booking(boolean) TO authenticated;

DROP POLICY IF EXISTS "public insere agendamento" ON public.agendamentos;
CREATE POLICY "public insere agendamento" ON public.agendamentos
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.barbearias b
      WHERE b.id = barbearia_id
        AND b.ativa = true
        AND b.allow_client_public_booking = true
    )
    AND public.barbearia_pode_agendar(barbearia_id)
    AND status = 'confirmado'
  );

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
BEGIN
  _digits := regexp_replace(COALESCE(_whatsapp, ''), '\D', '', 'g');
  IF length(_digits) < 10 THEN
    RAISE EXCEPTION 'WhatsApp inválido';
  END IF;

  SELECT
    a.id,
    a.barbearia_id,
    a.data,
    a.status,
    b.slug,
    b.allow_client_public_booking,
    b.allow_client_self_service
  INTO _row
  FROM public.agendamentos a
  JOIN public.barbearias b ON b.id = a.barbearia_id
  WHERE a.id = _agendamento_id
    AND b.slug = trim(_slug)
    AND b.ativa = true
    AND regexp_replace(a.cliente_whatsapp, '\D', '', 'g') = _digits;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;

  IF _row.status <> 'confirmado'::public.agendamento_status THEN
    RAISE EXCEPTION 'Agendamento não pode ser cancelado';
  END IF;

  IF NOT _row.allow_client_public_booking THEN
    RAISE EXCEPTION 'Agendamento pelo link desativado pela barbearia';
  END IF;

  IF NOT _row.allow_client_self_service THEN
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
  _old_data date;
  _old_hora time;
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
    a.status,
    b.slug,
    b.allow_client_public_booking,
    b.allow_client_self_service
  INTO _row
  FROM public.agendamentos a
  JOIN public.barbearias b ON b.id = a.barbearia_id
  WHERE a.id = p_agendamento_id
    AND b.slug = trim(p_slug)
    AND b.ativa = true
    AND regexp_replace(a.cliente_whatsapp, '\D', '', 'g') = _digits;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;

  IF _row.status <> 'confirmado'::public.agendamento_status THEN
    RAISE EXCEPTION 'Agendamento não pode ser alterado';
  END IF;

  IF NOT _row.allow_client_public_booking THEN
    RAISE EXCEPTION 'Agendamento pelo link desativado pela barbearia';
  END IF;

  IF NOT _row.allow_client_self_service THEN
    RAISE EXCEPTION 'Alteração pelo cliente desativada pela barbearia';
  END IF;

  IF NOT public.cliente_pode_gerenciar_agendamento(_row.data) THEN
    RAISE EXCEPTION 'Prazo para alterar expirou';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.barbeiros bb
    WHERE bb.id = p_barbeiro_id AND bb.barbearia_id = _row.barbearia_id AND bb.ativo = true
  ) THEN
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
  _barbearia_id uuid;
  _digits text;
BEGIN
  _digits := regexp_replace(COALESCE(_whatsapp, ''), '\D', '', 'g');
  IF length(_digits) < 10 THEN
    RETURN;
  END IF;

  SELECT b.id INTO _barbearia_id
  FROM public.barbearias b
  WHERE b.slug = trim(_slug)
    AND b.ativa = true
  LIMIT 1;

  IF NOT FOUND THEN
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
    bb.allow_client_self_service,
    bb.allow_client_public_booking
  FROM public.agendamentos a
  JOIN public.barbeiros br ON br.id = a.barbeiro_id
  JOIN public.barbearias bb ON bb.id = a.barbearia_id
  WHERE a.barbearia_id = _barbearia_id
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

CREATE OR REPLACE FUNCTION public.ensure_agenda_from_barbershop_slug(p_slug text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shop record;
  _barbearia_id uuid;
  _staff record;
  _barbeiro_id uuid;
  _slot_minutes int;
BEGIN
  SELECT
    id,
    slug,
    display_name,
    avatar_url,
    owner_id,
    slot_interval_minutes,
    allow_client_self_service,
    allow_client_public_booking
  INTO _shop
  FROM public.barbershops
  WHERE slug = trim(p_slug)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  _slot_minutes := COALESCE(_shop.slot_interval_minutes, 30);

  INSERT INTO public.barbearias (
    slug,
    nome,
    logo_url,
    owner_id,
    ativa,
    allow_client_self_service,
    allow_client_public_booking
  )
  VALUES (
    _shop.slug,
    _shop.display_name,
    COALESCE(_shop.avatar_url, ''),
    _shop.owner_id,
    true,
    COALESCE(_shop.allow_client_self_service, true),
    COALESCE(_shop.allow_client_public_booking, true)
  )
  ON CONFLICT (slug) DO UPDATE SET
    nome = EXCLUDED.nome,
    logo_url = EXCLUDED.logo_url,
    owner_id = EXCLUDED.owner_id,
    ativa = true,
    allow_client_self_service = EXCLUDED.allow_client_self_service,
    allow_client_public_booking = EXCLUDED.allow_client_public_booking,
    updated_at = now()
  RETURNING id INTO _barbearia_id;

  DELETE FROM public.barbeiros
  WHERE barbearia_id = _barbearia_id
    AND staff_id IS NULL;

  FOR _staff IN
    SELECT id, name FROM public.staff
    WHERE barbershop_id = _shop.id AND is_active = true
    ORDER BY sort_order, name
  LOOP
    INSERT INTO public.barbeiros (barbearia_id, nome, ativo, staff_id, slot_minutos)
    VALUES (_barbearia_id, _staff.name, true, _staff.id, _slot_minutes)
    ON CONFLICT (staff_id) DO UPDATE SET
      barbearia_id = EXCLUDED.barbearia_id,
      nome = EXCLUDED.nome,
      ativo = true,
      slot_minutos = EXCLUDED.slot_minutos
    RETURNING id INTO _barbeiro_id;

    DELETE FROM public.barbeiro_services WHERE barbeiro_id = _barbeiro_id;
    INSERT INTO public.barbeiro_services (barbeiro_id, nome, duracao_minutos, ativo)
    SELECT _barbeiro_id, ss.name, ss.duration_minutes, true
    FROM public.staff_services ss
    WHERE ss.staff_id = _staff.id;

    DELETE FROM public.disponibilidades WHERE barbeiro_id = _barbeiro_id;
    INSERT INTO public.disponibilidades (barbeiro_id, dia_semana, hora_inicio, hora_fim)
    SELECT _barbeiro_id, sch.day_of_week, sch.start_time, sch.end_time
    FROM public.staff_schedules sch
    WHERE sch.staff_id = _staff.id;
  END LOOP;

  RETURN _barbearia_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_agenda_from_barbershop_slug(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.cancelar_agendamento_cliente(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancelar_agendamento_cliente(uuid, text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.reagendar_agendamento_cliente(uuid, text, text, date, time, uuid, int, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reagendar_agendamento_cliente(uuid, text, text, date, time, uuid, int, text, text[]) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.listar_agendamentos_cliente(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_agendamentos_cliente(text, text) TO anon, authenticated;
