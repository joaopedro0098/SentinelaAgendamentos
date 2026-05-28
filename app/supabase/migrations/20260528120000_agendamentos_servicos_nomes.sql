-- Nomes dos serviços escolhidos no agendamento (link público ou painel).

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS servicos_nomes text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.agendamentos.servicos_nomes IS
  'Nomes dos serviços selecionados no momento do agendamento.';

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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT a.barbearia_id INTO _barbearia_id
  FROM public.agendamentos a
  WHERE a.id = p_agendamento_id AND a.status = 'confirmado';

  IF _barbearia_id IS NULL THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.barbearias b
    WHERE b.id = _barbearia_id AND b.owner_id = auth.uid()
    UNION ALL
    SELECT 1 FROM public.barbearias b
    INNER JOIN public.barbershops s ON s.slug = b.slug
    WHERE b.id = _barbearia_id AND s.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Sem permissão para alterar este agendamento';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.barbeiros bb
    WHERE bb.id = p_barbeiro_id AND bb.barbearia_id = _barbearia_id AND bb.ativo = true
  ) THEN
    RAISE EXCEPTION 'Colaborador inválido';
  END IF;

  IF p_duracao_minutos IS NULL OR p_duracao_minutos < 1 THEN
    RAISE EXCEPTION 'Duração inválida';
  END IF;

  UPDATE public.agendamentos
  SET
    data = p_data,
    hora = p_hora,
    barbeiro_id = p_barbeiro_id,
    duracao_minutos = p_duracao_minutos,
    observacao = NULLIF(trim(COALESCE(p_observacao, observacao)), ''),
    servicos_nomes = COALESCE(p_servicos_nomes, servicos_nomes)
  WHERE id = p_agendamento_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reagendar_agendamento(uuid, date, time, uuid, int, text, text[]) TO authenticated;
