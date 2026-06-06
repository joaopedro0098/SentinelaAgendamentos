-- Painel do barbeiro: excluir remove o registro por completo (cliente cancelando pelo link mantém status cancelado).

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
    RAISE EXCEPTION 'Sem permissão para excluir este agendamento';
  END IF;

  DELETE FROM public.agendamentos
  WHERE id = p_agendamento_id;
END;
$$;

COMMENT ON FUNCTION public.excluir_agendamento_painel(uuid) IS
  'Painel: remove o agendamento do banco. Cancelamento pelo cliente usa cancelar_agendamento_cliente (status cancelado).';
