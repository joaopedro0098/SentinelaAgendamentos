-- Painel: concluído/cancelado em hoje ou passado; faltou só em dias anteriores.

CREATE OR REPLACE FUNCTION public.alterar_status_agendamento_passado_painel(
  p_agendamento_id uuid,
  p_status text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_id uuid;
  _data date;
  _hoje date;
  _status public.agendamento_status;
  _confirmed_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF p_status NOT IN ('concluido', 'faltou', 'cancelado') THEN
    RAISE EXCEPTION 'Status inválido';
  END IF;

  _hoje := (timezone('America/Sao_Paulo', now()))::date;

  SELECT a.barbearia_id, a.data, a.status, a.client_confirmed_at
  INTO _barbearia_id, _data, _status, _confirmed_at
  FROM public.agendamentos a
  WHERE a.id = p_agendamento_id;

  IF _barbearia_id IS NULL THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;

  IF _data > _hoje THEN
    RAISE EXCEPTION 'Não é possível alterar status de agendamentos futuros';
  END IF;

  IF p_status = 'faltou' AND _data >= _hoje THEN
    RAISE EXCEPTION 'Faltou só pode ser registrado em dias anteriores';
  END IF;

  IF _status NOT IN (
    'confirmado'::public.agendamento_status,
    'concluido'::public.agendamento_status,
    'nao_veio'::public.agendamento_status,
    'cancelado'::public.agendamento_status
  ) THEN
    RAISE EXCEPTION 'Status atual não permite alteração';
  END IF;

  IF NOT public.painel_pode_gerenciar_agendamento(_barbearia_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar este agendamento';
  END IF;

  IF p_status = 'faltou' THEN
    IF _status = 'nao_veio'::public.agendamento_status THEN
      RETURN json_build_object('status', 'nao_veio', 'client_confirmed_at', _confirmed_at);
    END IF;

    UPDATE public.agendamentos
    SET status = 'nao_veio'::public.agendamento_status
    WHERE id = p_agendamento_id;

    RETURN json_build_object('status', 'nao_veio', 'client_confirmed_at', _confirmed_at);
  END IF;

  IF p_status = 'cancelado' THEN
    IF _status = 'cancelado'::public.agendamento_status THEN
      RETURN json_build_object('status', 'cancelado', 'client_confirmed_at', _confirmed_at);
    END IF;

    UPDATE public.agendamentos
    SET
      status = 'cancelado'::public.agendamento_status,
      cancelado_por = 'profissional'
    WHERE id = p_agendamento_id;

    RETURN json_build_object('status', 'cancelado', 'client_confirmed_at', _confirmed_at);
  END IF;

  IF _status = 'concluido'::public.agendamento_status THEN
    RETURN json_build_object('status', 'concluido', 'client_confirmed_at', _confirmed_at);
  END IF;

  UPDATE public.agendamentos
  SET
    status = 'concluido'::public.agendamento_status,
    client_confirmed_at = COALESCE(client_confirmed_at, now()),
    cancelado_por = NULL
  WHERE id = p_agendamento_id
  RETURNING client_confirmed_at INTO _confirmed_at;

  RETURN json_build_object('status', 'concluido', 'client_confirmed_at', _confirmed_at);
END;
$$;

COMMENT ON FUNCTION public.alterar_status_agendamento_passado_painel(uuid, text) IS
  'Painel: concluído/cancelado em hoje ou passado; faltou só em dias anteriores (SP).';
