-- Especialidade profissional (signup / landings nichadas). Features condicionais vêm depois.

CREATE TYPE public.professional_specialty AS ENUM (
  'dentista',
  'psicologo',
  'nutricionista',
  'medico'
);

ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS professional_specialty public.professional_specialty NULL;

COMMENT ON COLUMN public.barbershops.professional_specialty IS
  'Área de atuação informada no cadastro (landings nichadas ou select manual).';

CREATE OR REPLACE FUNCTION public.parse_professional_specialty_from_text(p_raw text)
RETURNS public.professional_specialty
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE trim(coalesce(p_raw, ''))
    WHEN 'dentista' THEN 'dentista'::public.professional_specialty
    WHEN 'psicologo' THEN 'psicologo'::public.professional_specialty
    WHEN 'nutricionista' THEN 'nutricionista'::public.professional_specialty
    WHEN 'medico' THEN 'medico'::public.professional_specialty
    ELSE NULL
  END;
$$;

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
  _invite_id uuid;
  _is_aggregated_invite boolean := false;
  _professional_specialty public.professional_specialty;
BEGIN
  norm_email := lower(trim(NEW.email));
  auth_provider := coalesce(NEW.raw_app_meta_data->>'provider', '');
  _professional_specialty := public.parse_professional_specialty_from_text(
    NEW.raw_user_meta_data->>'professional_specialty'
  );

  SELECT aa.id INTO _invite_id
  FROM public.aggregated_accounts aa
  WHERE aa.email = norm_email
    AND aa.status = 'pending'::public.aggregated_account_status
    AND aa.aggregated_user_id IS NULL
  ORDER BY aa.invited_at ASC
  LIMIT 1;

  _is_aggregated_invite := _invite_id IS NOT NULL;

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

  IF _is_aggregated_invite THEN
    sub_status := 'expired';
    trial_start := CURRENT_DATE - 14;
    IF norm_email IS NOT NULL AND norm_email <> '' THEN
      INSERT INTO public.trial_claims (email, user_id)
      VALUES (norm_email, NEW.id)
      ON CONFLICT (email) DO NOTHING;
    END IF;
  ELSE
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
  END IF;

  INSERT INTO public.barbershops (
    owner_id,
    slug,
    display_name,
    trial_started_at,
    subscription_status,
    face_verification_pending,
    professional_specialty
  )
  VALUES (
    NEW.id,
    public.generate_unique_slug(base_name),
    shop_display_name,
    trial_start,
    sub_status,
    true,
    _professional_specialty
  )
  ON CONFLICT DO NOTHING;

  IF _is_aggregated_invite THEN
    UPDATE public.aggregated_accounts
    SET
      aggregated_user_id = NEW.id,
      status = 'awaiting_face'::public.aggregated_account_status
    WHERE id = _invite_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.provision_professional_account(text, text);

CREATE OR REPLACE FUNCTION public.provision_professional_account(
  p_shop_name text,
  p_display_name text DEFAULT NULL,
  p_professional_specialty text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _norm_email text;
  _already_claimed boolean;
  _sub_status public.subscription_status;
  _trial_start date;
  _shop_name text;
  _display_name text;
  _specialty public.professional_specialty;
BEGIN
  IF _uid IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  _shop_name := trim(coalesce(p_shop_name, ''));
  IF length(_shop_name) < 2 THEN
    RETURN json_build_object('error', 'shop_name_too_short');
  END IF;

  _display_name := nullif(trim(coalesce(p_display_name, '')), '');
  _specialty := public.parse_professional_specialty_from_text(p_professional_specialty);

  IF EXISTS (SELECT 1 FROM public.barbershops s WHERE s.owner_id = _uid) THEN
    RETURN json_build_object('error', 'professional_account_exists');
  END IF;

  SELECT lower(trim(u.email)) INTO _norm_email FROM auth.users u WHERE u.id = _uid;

  INSERT INTO public.profiles (id, display_name, email)
  VALUES (_uid, _display_name, _norm_email)
  ON CONFLICT (id) DO UPDATE
  SET display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name),
      email = COALESCE(EXCLUDED.email, public.profiles.email);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, 'barber')
  ON CONFLICT (user_id, role) DO NOTHING;

  _already_claimed := false;
  IF _norm_email IS NOT NULL AND _norm_email <> '' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.trial_claims tc WHERE tc.email = _norm_email
    ) INTO _already_claimed;
  END IF;

  IF _already_claimed THEN
    _sub_status := 'expired';
    _trial_start := CURRENT_DATE - 14;
  ELSE
    _sub_status := 'trial';
    _trial_start := CURRENT_DATE;
    IF _norm_email IS NOT NULL AND _norm_email <> '' THEN
      INSERT INTO public.trial_claims (email, user_id)
      VALUES (_norm_email, _uid)
      ON CONFLICT (email) DO NOTHING;
    END IF;
  END IF;

  INSERT INTO public.barbershops (
    owner_id,
    slug,
    display_name,
    trial_started_at,
    subscription_status,
    face_verification_pending,
    professional_specialty
  )
  VALUES (
    _uid,
    public.generate_unique_slug(_shop_name),
    _shop_name,
    _trial_start,
    _sub_status,
    true,
    _specialty
  );

  RETURN json_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION public.provision_professional_account(text, text, text) IS
  'Cria barbershop/trial para usuário auth existente (perfil duplo paciente → profissional).';

GRANT EXECUTE ON FUNCTION public.provision_professional_account(text, text, text) TO authenticated;
