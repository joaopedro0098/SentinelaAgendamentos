-- Impedimento 1: e-mail que já usou trial permanece registrado após exclusão da conta.

CREATE TABLE IF NOT EXISTS public.trial_claims (
  email text PRIMARY KEY,
  user_id uuid,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trial_claims_email_normalized CHECK (email = lower(trim(email)))
);

COMMENT ON TABLE public.trial_claims IS
  'E-mails que já consumiram o teste grátis. Não é apagado ao excluir conta.';

ALTER TABLE public.trial_claims ENABLE ROW LEVEL SECURITY;

-- Backfill: contas existentes já consumiram o trial
INSERT INTO public.trial_claims (email, user_id, claimed_at)
SELECT lower(trim(u.email)), u.id, COALESCE(s.created_at, now())
FROM public.barbershops s
JOIN auth.users u ON u.id = s.owner_id
WHERE u.email IS NOT NULL AND trim(u.email) <> ''
ON CONFLICT (email) DO NOTHING;

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
    owner_id, slug, display_name, trial_started_at, subscription_status
  )
  VALUES (
    NEW.id,
    public.generate_unique_slug(base_name),
    base_name,
    trial_start,
    sub_status
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_subscription()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  _shop record;
  _trial_end date;
  _trial_days_left int;
  _can_book boolean;
  _barbearia_id uuid;
  _email text;
  _trial_already_used boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN json_build_object(
      'is_admin', true,
      'can_book', true,
      'subscription_status', 'active',
      'trial_already_used', false,
      'label', 'Administrador — acesso ilimitado'
    );
  END IF;

  SELECT s.* INTO _shop
  FROM public.barbershops s
  WHERE s.owner_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'no_shop', 'can_book', false);
  END IF;

  SELECT lower(trim(u.email)) INTO _email
  FROM auth.users u
  WHERE u.id = auth.uid();

  _trial_already_used := _email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.trial_claims tc WHERE tc.email = _email
  );

  SELECT b.id INTO _barbearia_id
  FROM public.barbearias b
  WHERE b.slug = _shop.slug
  LIMIT 1;

  _can_book := _barbearia_id IS NOT NULL AND public.barbearia_pode_agendar(_barbearia_id);
  _trial_end := _shop.trial_started_at + 13;
  _trial_days_left := GREATEST(0, (_shop.trial_started_at + 14) - CURRENT_DATE);

  RETURN json_build_object(
    'is_admin', false,
    'can_book', _can_book,
    'subscription_status', _shop.subscription_status,
    'trial_started_at', _shop.trial_started_at,
    'trial_days_left', _trial_days_left,
    'trial_last_day', _trial_end,
    'trial_already_used', _trial_already_used,
    'current_period_end', _shop.current_period_end,
    'grace_until', _shop.grace_until,
    'subscription_notice', _shop.subscription_notice,
    'mp_subscription_id', _shop.mp_subscription_id,
    'plan_price_label', 'R$ 19,90/mês'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_subscription() TO authenticated;
