-- Assinatura recorrente Mercado Pago (plataforma): mp_subscription_id = preapproval_id do profissional.

COMMENT ON COLUMN public.barbershops.mp_subscription_id IS
  'ID da assinatura individual (preapproval) no Mercado Pago da plataforma Sentinela. Distinto do preapproval_plan_id (tier R$39/R$49 no painel MP).';

ALTER TABLE public.barbershops
  DROP CONSTRAINT IF EXISTS barbershops_last_payment_method_check;

ALTER TABLE public.barbershops
  ADD CONSTRAINT barbershops_last_payment_method_check
  CHECK (last_payment_method IS NULL OR last_payment_method IN ('card', 'pix', 'mp_sub'));

COMMENT ON COLUMN public.barbershops.last_payment_method IS
  'card = Stripe; pix = Pix avulso plataforma; mp_sub = assinatura recorrente Mercado Pago (plataforma).';
