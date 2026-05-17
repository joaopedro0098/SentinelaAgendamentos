CREATE OR REPLACE FUNCTION public.ensure_current_user_barbearia()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid;
  _email text;
  _existing_id uuid;
  _base_slug text;
  _slug text;
  _suffix int := 0;
BEGIN
  _uid := auth.uid();

  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO _existing_id
  FROM public.barbearias
  WHERE owner_id = _uid
  LIMIT 1;

  IF _existing_id IS NOT NULL THEN
    RETURN _existing_id;
  END IF;

  SELECT email INTO _email
  FROM auth.users
  WHERE id = _uid;

  _base_slug := regexp_replace(lower(split_part(COALESCE(_email, ''), '@', 1)), '[^a-z0-9]+', '-', 'g');
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
  VALUES (_uid, 'Minha Barbearia', _slug, true, 'basico', 'trial', 50)
  RETURNING id INTO _existing_id;

  RETURN _existing_id;
END;
$$;