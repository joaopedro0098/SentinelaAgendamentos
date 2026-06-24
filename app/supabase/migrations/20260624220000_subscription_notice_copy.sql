-- Atualiza aviso de assinatura inativa para texto mais curto.

UPDATE public.barbershops
SET subscription_notice = 'Assine novamente em Conta para liberar agendamentos.'
WHERE subscription_notice = 'Assinatura inativa. Assine novamente em Conta para liberar agendamentos.';
