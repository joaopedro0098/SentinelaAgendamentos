-- Remove vínculo de assinatura pendente em contas que ainda estão no trial
-- (checkout de cartão iniciado mas não concluído).

UPDATE public.barbershops
SET mp_subscription_id = NULL
WHERE subscription_status = 'trial'
  AND mp_subscription_id IS NOT NULL;
