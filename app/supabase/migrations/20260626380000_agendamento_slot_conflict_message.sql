-- Mensagem amigável quando o horário já está ocupado (índice agendamentos_barbeiro_data_hora_ocupado_key).

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
    SET
      status = 'cancelado'::public.agendamento_status,
      cancelado_por = 'profissional'
    WHERE id = p_agendamento_id;

    RETURN json_build_object(
      'status', 'cancelado',
      'client_confirmed_at', _confirmed_at
    );
  END IF;

  BEGIN
    IF p_acao = 'confirmar' THEN
      UPDATE public.agendamentos
      SET
        status = 'confirmado'::public.agendamento_status,
        client_confirmed_at = COALESCE(client_confirmed_at, now()),
        cancelado_por = NULL
      WHERE id = p_agendamento_id
      RETURNING client_confirmed_at INTO _confirmed_at;

      RETURN json_build_object(
        'status', 'confirmado',
        'client_confirmed_at', _confirmed_at
      );
    END IF;

    UPDATE public.agendamentos
    SET
      status = 'confirmado'::public.agendamento_status,
      client_confirmed_at = NULL,
      cancelado_por = NULL
    WHERE id = p_agendamento_id;

    RETURN json_build_object(
      'status', 'confirmado',
      'client_confirmed_at', NULL
    );
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'Já existe um agendamento para este horário.';
  END;
END;
$$;

COMMENT ON FUNCTION public.alterar_agendamento_painel(uuid, text) IS
  'Painel: confirmar, marcar não confirmado ou cancelar. Conflito de horário retorna mensagem amigável.';
