-- Garante remoção completa das funções admin obsoletas (idempotente).
-- Seguro mesmo se 20260618030000 / 20260618040000 já tiverem sido aplicadas com REVOKE.

DROP FUNCTION IF EXISTS public.admin_invite_aggregated_account(text, text);
DROP FUNCTION IF EXISTS public.admin_list_all_aggregated_accounts();
DROP FUNCTION IF EXISTS public.admin_list_aggregated_accounts(text);
DROP FUNCTION IF EXISTS public.admin_remove_aggregated_account(uuid);
