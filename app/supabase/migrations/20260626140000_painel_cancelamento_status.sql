-- Painel: cancelar/reverter confirmação; excluir qualquer status.

CREATE OR REPLACE FUNCTION public.excluir_agendamento_painel(p_agendamento_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT a.barbearia_id INTO _barbearia_id
  FROM public.agendamentos a
  WHERE a.id = p_agendamento_id;

  IF _barbearia_id IS NULL THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;

  IF NOT public.painel_pode_gerenciar_agendamento(_barbearia_id) THEN
    RAISE EXCEPTION 'Sem permissão para excluir este agendamento';
  END IF;

  DELETE FROM public.agendamentos
  WHERE id = p_agendamento_id;
END;
$$;

COMMENT ON FUNCTION public.excluir_agendamento_painel(uuid) IS
  'Painel: remove o agendamento do banco (qualquer status). Cancelamento pelo cliente mantém status cancelado.';

CREATE OR REPLACE FUNCTION public.alterar_agendamento_painel(
  p_agendamento_id uuid,
  p_acao text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_id uuid;
  _status public.agendamento_status;
  _confirmed_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF p_acao NOT IN ('confirmar', 'nao_confirmado', 'cancelar') THEN
    RAISE EXCEPTION 'Ação inválida';
  END IF;

  SELECT a.barbearia_id, a.status, a.client_confirmed_at
  INTO _barbearia_id, _status, _confirmed_at
  FROM public.agendamentos a
  WHERE a.id = p_agendamento_id;

  IF _barbearia_id IS NULL THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;

  IF NOT public.painel_pode_gerenciar_agendamento(_barbearia_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar este agendamento';
  END IF;

  IF _status = 'nao_veio'::public.agendamento_status THEN
    RAISE EXCEPTION 'Use o menu de ações para agendamentos marcados como faltou';
  END IF;

  IF p_acao = 'cancelar' THEN
    IF _status <> 'confirmado'::public.agendamento_status THEN
      RAISE EXCEPTION 'Só é possível cancelar agendamentos confirmados';
    END IF;

    UPDATE public.agendamentos
    SET status = 'cancelado'::public.agendamento_status
    WHERE id = p_agendamento_id;

    RETURN json_build_object(
      'status', 'cancelado',
      'client_confirmed_at', _confirmed_at
    );
  END IF;

  IF p_acao = 'confirmar' THEN
    UPDATE public.agendamentos
    SET
      status = 'confirmado'::public.agendamento_status,
      client_confirmed_at = COALESCE(client_confirmed_at, now())
    WHERE id = p_agendamento_id
    RETURNING client_confirmed_at INTO _confirmed_at;

    RETURN json_build_object(
      'status', 'confirmado',
      'client_confirmed_at', _confirmed_at
    );
  END IF;

  -- nao_confirmado
  UPDATE public.agendamentos
  SET
    status = 'confirmado'::public.agendamento_status,
    client_confirmed_at = NULL
  WHERE id = p_agendamento_id;

  RETURN json_build_object(
    'status', 'confirmado',
    'client_confirmed_at', NULL
  );
END;
$$;

COMMENT ON FUNCTION public.alterar_agendamento_painel(uuid, text) IS
  'Painel: confirmar, marcar não confirmado ou cancelar. Reativa cancelados (só pelo profissional).';

GRANT EXECUTE ON FUNCTION public.alterar_agendamento_painel(uuid, text) TO authenticated;

-- CT/AA: confirmar presença com a mesma regra de permissão das demais ações.

CREATE OR REPLACE FUNCTION public.confirmar_presenca_agendamento_painel(p_agendamento_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_id uuid;
  _confirmed_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT a.barbearia_id, a.client_confirmed_at
  INTO _barbearia_id, _confirmed_at
  FROM public.agendamentos a
  WHERE a.id = p_agendamento_id AND a.status = 'confirmado';

  IF _barbearia_id IS NULL THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;

  IF NOT public.painel_pode_gerenciar_agendamento(_barbearia_id) THEN
    RAISE EXCEPTION 'Sem permissão para confirmar este agendamento';
  END IF;

  IF _confirmed_at IS NOT NULL THEN
    RETURN _confirmed_at;
  END IF;

  UPDATE public.agendamentos
  SET client_confirmed_at = now()
  WHERE id = p_agendamento_id
  RETURNING client_confirmed_at INTO _confirmed_at;

  RETURN _confirmed_at;
END;
$$;
