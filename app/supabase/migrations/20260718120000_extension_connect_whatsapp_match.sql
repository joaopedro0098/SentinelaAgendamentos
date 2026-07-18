-- Alinha Connect com whatsapp_match_digits (últimos 11 dígitos + DDI 55), usado no resto do painel.

CREATE OR REPLACE FUNCTION public.extension_connect_whatsapp_matches(p_a text, p_b text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.whatsapp_match_digits(p_a, p_b);
$$;

COMMENT ON FUNCTION public.extension_connect_whatsapp_matches(text, text) IS
  'Match de WhatsApp para Sentinela Connect — delega para whatsapp_match_digits (11 dígitos finais / DDI).';
