-- Painel: alterar status de agendamentos em dias passados (confirmado, faltou, cancelado).

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

  IF p_status NOT IN ('confirmado', 'faltou', 'cancelado') THEN
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

  IF _data >= _hoje THEN
    RAISE EXCEPTION 'Só é possível alterar status de agendamentos de dias anteriores';
  END IF;

  IF _status NOT IN (
    'confirmado'::public.agendamento_status,
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

  -- confirmado
  IF _status = 'confirmado'::public.agendamento_status THEN
    RETURN json_build_object('status', 'confirmado', 'client_confirmed_at', _confirmed_at);
  END IF;

  UPDATE public.agendamentos
  SET
    status = 'confirmado'::public.agendamento_status,
    client_confirmed_at = COALESCE(client_confirmed_at, now()),
    cancelado_por = NULL
  WHERE id = p_agendamento_id
  RETURNING client_confirmed_at INTO _confirmed_at;

  RETURN json_build_object('status', 'confirmado', 'client_confirmed_at', _confirmed_at);
END;
$$;

GRANT EXECUTE ON FUNCTION public.alterar_status_agendamento_passado_painel(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.alterar_status_agendamento_passado_painel(uuid, text) IS
  'Painel: define confirmado, faltou ou cancelado em agendamentos de dias anteriores.';
