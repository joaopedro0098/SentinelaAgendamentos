-- Remove RPCs legadas substituídas por alterar_status_agendamento_passado_painel.

DROP FUNCTION IF EXISTS public.marcar_falta_agendamento_painel(uuid);
DROP FUNCTION IF EXISTS public.reverter_falta_agendamento_painel(uuid);
