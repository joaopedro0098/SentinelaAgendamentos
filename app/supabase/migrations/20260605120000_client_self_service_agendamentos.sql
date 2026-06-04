-- Autoatendimento do cliente: alterar/cancelar pelo link público.

ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS allow_client_self_service boolean NOT NULL DEFAULT true;

ALTER TABLE public.barbearias
  ADD COLUMN IF NOT EXISTS allow_client_self_service boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.barbershops.allow_client_self_service IS
  'Se true, clientes podem alterar/cancelar pelo link (respeitando prazo de 1 dia antes).';
COMMENT ON COLUMN public.barbearias.allow_client_self_service IS
  'Espelho da configuração da barbershop para RPCs da agenda pública.';

CREATE OR REPLACE FUNCTION public.cliente_pode_gerenciar_agendamento(_data date)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT (timezone('America/Sao_Paulo', now()))::date < (_data - 1);
$$;

COMMENT ON FUNCTION public.cliente_pode_gerenciar_agendamento(date) IS
  'True até a meia-noite do dia anterior ao agendamento (fuso America/Sao_Paulo).';

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

-- PostgreSQL não permite CREATE OR REPLACE quando muda o RETURNS TABLE.
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
  allow_client_self_service boolean
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
    bb.allow_client_self_service
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

REVOKE ALL ON FUNCTION public.cancelar_agendamento_cliente(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancelar_agendamento_cliente(uuid, text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.reagendar_agendamento_cliente(uuid, text, text, date, time, uuid, int, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reagendar_agendamento_cliente(uuid, text, text, date, time, uuid, int, text, text[]) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.listar_agendamentos_cliente(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_agendamentos_cliente(text, text) TO anon, authenticated;
