-- Painel: barbeiro confirma presença do cliente sem enviar link.

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

  IF NOT EXISTS (
    SELECT 1 FROM public.barbearias b
    WHERE b.id = _barbearia_id AND b.owner_id = auth.uid()
    UNION ALL
    SELECT 1 FROM public.barbearias b
    INNER JOIN public.barbershops s ON s.slug = b.slug
    WHERE b.id = _barbearia_id AND s.owner_id = auth.uid()
  ) THEN
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

COMMENT ON FUNCTION public.confirmar_presenca_agendamento_painel(uuid) IS
  'Painel: marca client_confirmed_at quando o barbeiro confirma presencialmente.';

GRANT EXECUTE ON FUNCTION public.confirmar_presenca_agendamento_painel(uuid) TO authenticated;
