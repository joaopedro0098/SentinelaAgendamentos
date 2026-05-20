-- Após vencimento do período pago, mantém 3 dias de tolerância para novos agendamentos.
-- No 4º dia após current_period_end, novos agendamentos/reagendamentos passam a bloquear.

CREATE OR REPLACE FUNCTION public.barbearia_pode_agendar(_barbearia_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shop record;
BEGIN
  SELECT b.ativa, s.owner_id, s.trial_started_at, s.subscription_status,
         s.current_period_end, s.grace_until
  INTO _shop
  FROM public.barbearias b
  JOIN public.barbershops s ON s.slug = b.slug
  WHERE b.id = _barbearia_id;

  IF NOT FOUND OR NOT _shop.ativa THEN
    RETURN false;
  END IF;

  IF _shop.owner_id IS NOT NULL AND public.has_role(_shop.owner_id, 'admin'::public.app_role) THEN
    RETURN true;
  END IF;

  IF _shop.subscription_status = 'trial' THEN
    RETURN CURRENT_DATE < (_shop.trial_started_at + 14);
  END IF;

  IF _shop.subscription_status = 'active' THEN
    RETURN _shop.current_period_end IS NULL OR CURRENT_DATE <= (_shop.current_period_end + 3);
  END IF;

  IF _shop.subscription_status = 'cancelled' THEN
    RETURN _shop.current_period_end IS NOT NULL AND CURRENT_DATE <= _shop.current_period_end;
  END IF;

  IF _shop.subscription_status = 'grace' THEN
    RETURN _shop.grace_until IS NOT NULL AND CURRENT_DATE <= _shop.grace_until;
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.barbearia_pode_agendar(uuid) IS
  'Libera novos agendamentos/reagendamentos. Admin isento. Trial = 14 dias corridos. Período pago tem 3 dias de tolerância após vencimento.';
