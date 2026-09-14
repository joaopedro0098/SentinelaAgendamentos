-- Remove Sentinela Connect (extensão WhatsApp Web): tabelas, RPCs e dependências.

DROP FUNCTION IF EXISTS public.extension_connect_client_lookup(uuid, text, text);
DROP FUNCTION IF EXISTS public.extension_connect_client_lookup(uuid, text);
DROP FUNCTION IF EXISTS public.extension_connect_clinic_display_name(uuid);
DROP FUNCTION IF EXISTS public.extension_connect_list_message_templates(uuid);
DROP FUNCTION IF EXISTS public.extension_connect_upsert_message_template(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.extension_connect_delete_message_template(uuid, uuid);
DROP FUNCTION IF EXISTS public.extension_connect_pode_ler_conteudo_anotacao(uuid, uuid);
DROP FUNCTION IF EXISTS public.extension_connect_whatsapp_matches(text, text);
DROP FUNCTION IF EXISTS public.create_extension_connect_token(text);
DROP FUNCTION IF EXISTS public.list_extension_connect_tokens();
DROP FUNCTION IF EXISTS public.revoke_extension_connect_token(uuid);
DROP FUNCTION IF EXISTS public.validate_extension_connect_token(text);

DROP TABLE IF EXISTS public.extension_connect_message_templates;
DROP TABLE IF EXISTS public.extension_connect_tokens;
