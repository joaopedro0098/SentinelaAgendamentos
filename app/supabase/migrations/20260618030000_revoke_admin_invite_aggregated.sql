-- Remove função obsoleta admin_invite_aggregated_account do banco.
-- CTs/AA agregam via invite_aggregated_account(); admin cria AAs via admin_set_admin_aggregated().

DROP FUNCTION IF EXISTS public.admin_invite_aggregated_account(text, text);
