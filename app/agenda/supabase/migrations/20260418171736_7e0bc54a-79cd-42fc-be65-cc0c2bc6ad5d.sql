-- Função: cria barbearia automaticamente para novo usuário "barbeiro"
CREATE OR REPLACE FUNCTION public.handle_new_user_barbearia()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text;
  _base_slug text;
  _slug text;
  _suffix int := 0;
BEGIN
  -- Só cria se ainda não existir barbearia para este owner
  IF EXISTS (SELECT 1 FROM public.barbearias WHERE owner_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  _email := COALESCE(NEW.email, '');

  -- Gera slug base a partir do email (parte antes do @), só [a-z0-9-]
  _base_slug := regexp_replace(lower(split_part(_email, '@', 1)), '[^a-z0-9]+', '-', 'g');
  _base_slug := trim(both '-' from _base_slug);
  IF _base_slug IS NULL OR length(_base_slug) = 0 THEN
    _base_slug := 'barbearia';
  END IF;

  _slug := _base_slug;
  WHILE EXISTS (SELECT 1 FROM public.barbearias WHERE slug = _slug) LOOP
    _suffix := _suffix + 1;
    _slug := _base_slug || '-' || _suffix::text;
  END LOOP;

  INSERT INTO public.barbearias (owner_id, nome, slug, ativa, plano, plano_status, limite_clientes_mensais)
  VALUES (NEW.id, 'Minha Barbearia', _slug, true, 'basico', 'trial', 50);

  RETURN NEW;
END;
$$;

-- Trigger: dispara depois do trigger handle_new_user (que cria a role)
DROP TRIGGER IF EXISTS on_auth_user_created_barbearia ON auth.users;
CREATE TRIGGER on_auth_user_created_barbearia
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_barbearia();