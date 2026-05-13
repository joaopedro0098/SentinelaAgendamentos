-- search_path explícito
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Revoga execute (são triggers, não precisam ser chamáveis via API)
REVOKE EXECUTE ON FUNCTION public.update_conversation_last_message() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

-- Substitui a policy de SELECT no bucket por uma que NÃO permite listar (apenas acesso direto via URL pública continua funcionando pelo CDN)
DROP POLICY IF EXISTS "Public can view barbershop avatars" ON storage.objects;