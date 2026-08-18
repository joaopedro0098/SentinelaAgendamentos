-- Permite que usuário autenticado (ex.: paciente) crie conta profissional sem novo auth.users.

CREATE OR REPLACE FUNCTION public.provision_professional_account(
  p_shop_name text,
  p_display_name text DEFAULT NULL
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
BEGIN
  IF _uid IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  _shop_name := trim(coalesce(p_shop_name, ''));
  IF length(_shop_name) < 2 THEN
    RETURN json_build_object('error', 'shop_name_too_short');
  END IF;

  _display_name := nullif(trim(coalesce(p_display_name, '')), '');

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
    face_verification_pending
  )
  VALUES (
    _uid,
    public.generate_unique_slug(_shop_name),
    _shop_name,
    _trial_start,
    _sub_status,
    true
  );

  RETURN json_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION public.provision_professional_account(text, text) IS
  'Cria barbershop/trial para usuário auth existente (perfil duplo paciente → profissional).';

GRANT EXECUTE ON FUNCTION public.provision_professional_account(text, text) TO authenticated;
