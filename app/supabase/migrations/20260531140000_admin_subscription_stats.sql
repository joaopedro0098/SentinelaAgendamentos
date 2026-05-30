-- Forma de pagamento do último período ativado (cartão Stripe ou Pix MP).
ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS last_payment_method text;

ALTER TABLE public.barbershops
  DROP CONSTRAINT IF EXISTS barbershops_last_payment_method_check;

ALTER TABLE public.barbershops
  ADD CONSTRAINT barbershops_last_payment_method_check
  CHECK (last_payment_method IS NULL OR last_payment_method IN ('card', 'pix'));

COMMENT ON COLUMN public.barbershops.last_payment_method IS
  'Última forma de pagamento que ativou/renovou o plano: card (Stripe) ou pix (Mercado Pago).';

-- Backfill assinantes ativos existentes.
UPDATE public.barbershops
SET last_payment_method = CASE
  WHEN stripe_subscription_id IS NOT NULL AND btrim(stripe_subscription_id) <> '' THEN 'card'
  ELSE 'pix'
END
WHERE subscription_status = 'active'::public.subscription_status
  AND last_payment_method IS NULL;

CREATE OR REPLACE FUNCTION public.admin_subscription_stats()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total int;
  _card int;
  _pix int;
  _trial int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (
      WHERE COALESCE(
        s.last_payment_method,
        CASE
          WHEN s.stripe_subscription_id IS NOT NULL AND btrim(s.stripe_subscription_id) <> '' THEN 'card'
          ELSE 'pix'
        END
      ) = 'card'
    )::int,
    COUNT(*) FILTER (
      WHERE COALESCE(
        s.last_payment_method,
        CASE
          WHEN s.stripe_subscription_id IS NOT NULL AND btrim(s.stripe_subscription_id) <> '' THEN 'card'
          ELSE 'pix'
        END
      ) = 'pix'
    )::int
  INTO _total, _card, _pix
  FROM public.barbershops s
  WHERE s.subscription_status = 'active'::public.subscription_status
    AND s.owner_id IS NOT NULL
    AND NOT public.has_role(s.owner_id, 'admin'::public.app_role);

  SELECT COUNT(*)::int
  INTO _trial
  FROM public.barbershops s
  WHERE s.subscription_status = 'trial'::public.subscription_status
    AND CURRENT_DATE < (s.trial_started_at + 14)
    AND s.owner_id IS NOT NULL
    AND NOT public.has_role(s.owner_id, 'admin'::public.app_role);

  RETURN json_build_object(
    'total_subscribers', _total,
    'subscribers_card', _card,
    'subscribers_pix', _pix,
    'trial_users', _trial
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_subscription_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_subscription_stats() TO authenticated;
