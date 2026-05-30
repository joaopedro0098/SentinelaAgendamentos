-- Remove aviso obsoleto de pagamento com cartão pendente (Stripe Payment Element).
UPDATE public.barbershops
SET subscription_notice = NULL
WHERE subscription_notice = 'Finalize o pagamento com cartão para ativar sua assinatura.';
