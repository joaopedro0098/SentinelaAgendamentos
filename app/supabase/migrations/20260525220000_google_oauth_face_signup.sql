-- Google OAuth: perfil sem nome pré-preenchido; barbearia com nome em branco; verificação facial pendente.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  auth_provider text;
  base_name text;
  shop_display_name text;
  profile_display_name text;
  profile_avatar_url text;
  norm_email text;
  already_claimed boolean;
  sub_status public.subscription_status;
  trial_start date;
BEGIN
  norm_email := lower(trim(NEW.email));
  auth_provider := coalesce(NEW.raw_app_meta_data->>'provider', '');

  IF auth_provider = 'google' THEN
    base_name := coalesce(nullif(split_part(NEW.email, '@', 1), ''), 'barbearia');
    shop_display_name := '';
    profile_display_name := NULL;
    profile_avatar_url := NULL;
  ELSE
    base_name := coalesce(
      NEW.raw_user_meta_data->>'shop_name',
      NEW.raw_user_meta_data->>'barbershop_name',
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1),
      'barbearia'
    );
    shop_display_name := base_name;
    profile_display_name := coalesce(
      NEW.raw_user_meta_data->>'display_name',
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name'
    );
    profile_avatar_url := NEW.raw_user_meta_data->>'avatar_url';
  END IF;

  INSERT INTO public.profiles (id, display_name, email, avatar_url)
  VALUES (
    NEW.id,
    profile_display_name,
    NEW.email,
    profile_avatar_url
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
    shop_display_name,
    trial_start,
    sub_status,
    true
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- Contas Google já criadas sem biometria: exige verificação facial na próxima entrada.
UPDATE public.barbershops b
SET face_verification_pending = true
FROM auth.users u
WHERE b.owner_id = u.id
  AND coalesce(u.raw_app_meta_data->>'provider', '') = 'google'
  AND NOT EXISTS (
    SELECT 1 FROM public.facial_embeddings fe WHERE fe.user_id = u.id
  )
  AND b.face_verification_pending = false;
