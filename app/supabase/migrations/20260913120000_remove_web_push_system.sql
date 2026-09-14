-- Remove Web Push (cliente + profissional). Lembretes WhatsApp permanecem.

DROP FUNCTION IF EXISTS public.get_client_confirmation_push_status(text, text);
DROP FUNCTION IF EXISTS public.inherit_appointment_push_subscription(uuid, boolean);
DROP FUNCTION IF EXISTS public.inherit_appointment_push_subscription(uuid);

DROP TABLE IF EXISTS public.appointment_push_subscriptions CASCADE;
DROP TABLE IF EXISTS public.barber_push_subscriptions CASCADE;

ALTER TABLE public.agendamentos
  DROP COLUMN IF EXISTS confirmation_push_sent_at,
  DROP COLUMN IF EXISTS reminder_push_sent_at,
  DROP COLUMN IF EXISTS barber_new_booking_push_sent_at;

-- Cancelamento automático: passa a depender do lembrete D-1 WhatsApp enviado (não mais push).
CREATE OR REPLACE FUNCTION public.cancel_unconfirmed_appointments()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer;
BEGIN
  UPDATE public.agendamentos
  SET
    status = 'cancelado',
    cancel_reason = 'Não confirmado pelo cliente no dia anterior'
  WHERE status = 'confirmado'
    AND requires_client_confirmation = true
    AND reminder_whatsapp_sent_at IS NOT NULL
    AND client_confirmed_at IS NULL
    AND data <= CURRENT_DATE;

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_unconfirmed_appointments() TO service_role;

-- RPC que ainda zerava colunas de push removidas.
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
    client_confirmed_at = NULL
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
