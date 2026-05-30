-- Remove referências legadas à assinatura recorrente com cartão no Mercado Pago (agora Stripe).
UPDATE public.barbershops
SET mp_subscription_id = NULL
WHERE mp_subscription_id IS NOT NULL;

COMMENT ON COLUMN public.barbershops.mp_subscription_id IS
  'Legado Mercado Pago (cartão recorrente). Não utilizado — cartão via Stripe; Pix avulso no MP.';
