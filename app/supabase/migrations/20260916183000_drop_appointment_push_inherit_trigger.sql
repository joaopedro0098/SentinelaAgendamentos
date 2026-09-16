-- Completa remoção do Web Push: trigger ainda chamava inherit_appointment_push_subscription após DROP da função.

DROP TRIGGER IF EXISTS inherit_push_subscription_on_agendamento ON public.agendamentos;
DROP FUNCTION IF EXISTS public.trg_inherit_appointment_push_subscription();
