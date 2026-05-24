-- Impedimento 2: embedding facial persiste após exclusão; bloqueia trial repetido.

CREATE TABLE IF NOT EXISTS public.facial_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  embedding real[] NOT NULL,
  model_version text NOT NULL DEFAULT 'face-api-v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facial_embeddings_dims CHECK (array_length(embedding, 1) = 128)
);

COMMENT ON TABLE public.facial_embeddings IS
  'Descritores faciais (128d). Mantidos após exclusão de conta (user_id anulado).';

CREATE INDEX IF NOT EXISTS idx_facial_embeddings_user ON public.facial_embeddings(user_id);

ALTER TABLE public.facial_embeddings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.face_descriptor_distance(a real[], b real[])
RETURNS double precision
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  i int;
  len int;
  sum_sq double precision := 0;
BEGIN
  IF a IS NULL OR b IS NULL THEN
    RETURN NULL;
  END IF;
  len := array_length(a, 1);
  IF len IS NULL OR len <> array_length(b, 1) THEN
    RETURN NULL;
  END IF;
  FOR i IN 1..len LOOP
    sum_sq := sum_sq + power(a[i] - b[i], 2);
  END LOOP;
  RETURN sqrt(sum_sq);
END;
$$;

CREATE OR REPLACE FUNCTION public.face_has_existing_match(
  p_embedding real[],
  p_max_distance double precision DEFAULT 0.55
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.facial_embeddings fe
    WHERE public.face_descriptor_distance(fe.embedding, p_embedding) < p_max_distance
  );
$$;

CREATE OR REPLACE FUNCTION public.jsonb_to_real_array(j jsonb)
RETURNS real[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  out real[] := '{}';
  elem jsonb;
  i int := 1;
BEGIN
  IF j IS NULL OR jsonb_typeof(j) <> 'array' THEN
    RETURN NULL;
  END IF;
  FOR elem IN SELECT value FROM jsonb_array_elements(j) LOOP
    out[i] := (elem #>> '{}')::real;
    i := i + 1;
  END LOOP;
  RETURN out;
END;
$$;

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
  face_embedding real[];
  face_match boolean;
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

  face_embedding := public.jsonb_to_real_array(NEW.raw_user_meta_data->'face_embedding');
  face_match := false;
  IF face_embedding IS NOT NULL AND array_length(face_embedding, 1) = 128 THEN
    face_match := public.face_has_existing_match(face_embedding);
    IF face_match THEN
      already_claimed := true;
    END IF;
    INSERT INTO public.facial_embeddings (user_id, embedding)
    VALUES (NEW.id, face_embedding);
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
  _facial_trial_used boolean;
  _my_embedding real[];
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
      'facial_trial_used', false,
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

  SELECT fe.embedding INTO _my_embedding
  FROM public.facial_embeddings fe
  WHERE fe.user_id = auth.uid()
  ORDER BY fe.created_at DESC
  LIMIT 1;

  _facial_trial_used := _my_embedding IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.facial_embeddings fe
    WHERE fe.user_id IS DISTINCT FROM auth.uid()
      AND public.face_descriptor_distance(fe.embedding, _my_embedding) < 0.55
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
    'facial_trial_used', _facial_trial_used,
    'current_period_end', _shop.current_period_end,
    'grace_until', _shop.grace_until,
    'subscription_notice', _shop.subscription_notice,
    'mp_subscription_id', _shop.mp_subscription_id,
    'plan_price_label', 'R$ 19,90/mês'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_subscription() TO authenticated;

CREATE OR REPLACE FUNCTION public.check_facial_trial_eligibility(p_embedding real[])
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _match boolean;
BEGIN
  IF p_embedding IS NULL OR array_length(p_embedding, 1) IS DISTINCT FROM 128 THEN
    RETURN json_build_object('trial_eligible', false, 'facial_match', false, 'error', 'invalid_embedding');
  END IF;

  _match := public.face_has_existing_match(p_embedding);

  RETURN json_build_object(
    'trial_eligible', NOT _match,
    'facial_match', _match
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_facial_trial_eligibility(real[]) TO anon, authenticated;
