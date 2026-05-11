-- Function to slugify
CREATE OR REPLACE FUNCTION public.generate_unique_slug(base text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s text;
  candidate text;
  i int := 0;
BEGIN
  s := lower(regexp_replace(coalesce(base, 'barbearia'), '[^a-zA-Z0-9]+', '-', 'g'));
  s := trim(both '-' from s);
  IF s = '' THEN s := 'barbearia'; END IF;
  candidate := s;
  WHILE EXISTS (SELECT 1 FROM public.barbershops WHERE slug = candidate) LOOP
    i := i + 1;
    candidate := s || '-' || i::text;
  END LOOP;
  RETURN candidate;
END;
$$;

-- Function to create barbershop on new user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_name text;
BEGIN
  base_name := coalesce(
    NEW.raw_user_meta_data->>'barbershop_name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1),
    'barbearia'
  );
  INSERT INTO public.barbershops (owner_id, slug, display_name)
  VALUES (NEW.id, public.generate_unique_slug(base_name), base_name)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill existing users without a barbershop
INSERT INTO public.barbershops (owner_id, slug, display_name)
SELECT u.id,
       public.generate_unique_slug(coalesce(split_part(u.email, '@', 1), 'barbearia')),
       coalesce(split_part(u.email, '@', 1), 'Minha barbearia')
FROM auth.users u
LEFT JOIN public.barbershops b ON b.owner_id = u.id
WHERE b.id IS NULL;