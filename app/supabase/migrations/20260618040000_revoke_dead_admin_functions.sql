-- Remove funções admin obsoletas de CT→CA (substituídas pelo fluxo do titular em Configurações).

DROP FUNCTION IF EXISTS public.admin_list_all_aggregated_accounts();
DROP FUNCTION IF EXISTS public.admin_list_aggregated_accounts(text);
DROP FUNCTION IF EXISTS public.admin_remove_aggregated_account(uuid);
