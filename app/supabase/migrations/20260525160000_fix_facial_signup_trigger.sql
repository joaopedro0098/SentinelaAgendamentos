-- Corrige "Database error saving new user": tabelas internas sem RLS bloqueando trigger;
-- embedding facial passa a ser registrado via RPC após signup (não no metadata).

ALTER TABLE public.trial_claims DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.facial_embeddings DISABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  base_name text;
  norm_email text;
  already_claimed boolean;
  sub_status public.subscription_status;
  trial_start date;
BEGIN
  norm_email := lower(trim(NEW.email));

  base_name := coalesce(
    NEW.raw_user_meta_data->>'shop_name',
    NEW.raw_user_meta_data->>'barbershop_name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1),
    'barbearia'
  );

  INSERT INTO public.profiles (id, display_name, email, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'barber')
  ON CONFLICT (user_id, role) DO NOTHING;

  already_claimed := false;
  IF norm_email IS NOT NULL AND norm_email <> '' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.trial_claims tc WHERE tc.email = norm_email
    ) INTO already_claimed;
  END IF;

  IF already_claimed THEN
    sub_status := 'expired';
    trial_start := CURRENT_DATE - 14;
  ELSE
    sub_status := 'trial';
    trial_start := CURRENT_DATE;
    IF norm_email IS NOT NULL AND norm_email <> '' THEN
      INSERT INTO public.trial_claims (email, user_id)
      VALUES (norm_email, NEW.id)
      ON CONFLICT (email) DO NOTHING;
    END IF;
  END IF;

  INSERT INTO public.barbershops (
    owner_id, slug, display_name, trial_started_at, subscription_status, face_verification_pending
  )
  VALUES (
    NEW.id,
    public.generate_unique_slug(base_name),
    base_name,
    trial_start,
    sub_status,
    true
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;
