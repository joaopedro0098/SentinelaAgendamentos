-- Limpeza: função sem referências no app ou em outras RPCs.

DROP FUNCTION IF EXISTS public.user_is_active_aggregated_account(uuid);
