-- Remove o teto mensal de agendamentos por barbearia (ilimitado por enquanto).
-- A coluna limite_clientes_mensais permanece para uso futuro com planos pagos.

CREATE OR REPLACE FUNCTION public.barbearia_dentro_do_limite(_barbearia_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.barbearias
    WHERE id = _barbearia_id AND ativa = true
  );
END;
$$;

COMMENT ON FUNCTION public.barbearia_dentro_do_limite(uuid) IS
  'Verifica apenas se a barbearia está ativa. Limite mensal desativado até haver cobrança por plano.';
