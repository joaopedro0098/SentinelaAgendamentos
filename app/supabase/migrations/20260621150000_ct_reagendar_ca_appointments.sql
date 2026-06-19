-- CT/AA: reagendar agendamentos das CAs pelo painel (inclui troca de colaborador entre hub e CAs).

CREATE OR REPLACE FUNCTION public.user_can_manage_barbearia(
  p_barbearia_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.barbearias b
      WHERE b.id = p_barbearia_id
        AND b.owner_id = p_user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.barbearias b
      INNER JOIN public.barbershops s ON s.slug = b.slug
      WHERE b.id = p_barbearia_id
        AND s.owner_id = p_user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.aggregated_accounts aa
      JOIN public.barbershops cs ON cs.owner_id = aa.aggregated_user_id
      JOIN public.barbearias cb ON cb.slug = cs.slug
      WHERE aa.owner_user_id = p_user_id
        AND aa.status = 'active'::public.aggregated_account_status
        AND cb.id = p_barbearia_id
    );
$$;

COMMENT ON FUNCTION public.user_can_manage_barbearia(uuid, uuid) IS
  'True se o usuário gerencia a barbearia: dono, barbershop vinculado ou CT/AA da CA agregada.';

GRANT EXECUTE ON FUNCTION public.user_can_manage_barbearia(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reagendar_agendamento(
  p_agendamento_id uuid,
  p_data date,
  p_hora time,
  p_barbeiro_id uuid,
  p_duracao_minutos int,
  p_observacao text DEFAULT NULL,
  p_servicos_nomes text[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_id uuid;
  _target_barbearia_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT a.barbearia_id INTO _barbearia_id
  FROM public.agendamentos a
  WHERE a.id = p_agendamento_id
    AND a.status = 'confirmado'::public.agendamento_status;

  IF _barbearia_id IS NULL THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;

  IF NOT public.user_can_manage_barbearia(_barbearia_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar este agendamento';
  END IF;

  SELECT bb.barbearia_id
  INTO _target_barbearia_id
  FROM public.barbeiros bb
  WHERE bb.id = p_barbeiro_id
    AND bb.ativo = true;

  IF _target_barbearia_id IS NULL THEN
    RAISE EXCEPTION 'Colaborador inválido';
  END IF;

  IF NOT public.user_can_manage_barbearia(_target_barbearia_id) THEN
    RAISE EXCEPTION 'Colaborador inválido';
  END IF;

  IF NOT public.barbearia_pode_agendar(_target_barbearia_id) THEN
    RAISE EXCEPTION 'Função bloqueada. Favor realizar o pagamento da mensalidade para liberar.';
  END IF;

  IF p_duracao_minutos IS NULL OR p_duracao_minutos < 1 THEN
    RAISE EXCEPTION 'Duração inválida';
  END IF;

  UPDATE public.agendamentos
  SET
    barbearia_id = _target_barbearia_id,
    data = p_data,
    hora = p_hora,
    barbeiro_id = p_barbeiro_id,
    duracao_minutos = p_duracao_minutos,
    observacao = NULLIF(trim(COALESCE(p_observacao, observacao)), ''),
    servicos_nomes = COALESCE(p_servicos_nomes, servicos_nomes)
  WHERE id = p_agendamento_id;
END;
$$;

COMMENT ON FUNCTION public.reagendar_agendamento(uuid, date, time, uuid, int, text, text[]) IS
  'Painel: reagenda agendamento confirmado. CT/AA podem alterar agendamentos das CAs e trocar colaborador.';

GRANT EXECUTE ON FUNCTION public.reagendar_agendamento(uuid, date, time, uuid, int, text, text[]) TO authenticated;

-- Sobrecarga legada (sem servicos_nomes)
CREATE OR REPLACE FUNCTION public.reagendar_agendamento(
  p_agendamento_id uuid,
  p_data date,
  p_hora time,
  p_barbeiro_id uuid,
  p_duracao_minutos int,
  p_observacao text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.reagendar_agendamento(
    p_agendamento_id,
    p_data,
    p_hora,
    p_barbeiro_id,
    p_duracao_minutos,
    p_observacao,
    NULL::text[]
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reagendar_agendamento(uuid, date, time, uuid, int, text) TO authenticated;
