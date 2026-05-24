-- Verificação facial obrigatória para cadastro Google (OAuth sem embedding no signup).

ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS face_verification_pending boolean NOT NULL DEFAULT false;

UPDATE public.barbershops SET face_verification_pending = false;

CREATE OR REPLACE FUNCTION public.face_has_existing_match(
  p_embedding real[],
  p_exclude_user_id uuid DEFAULT NULL,
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
      AND (p_exclude_user_id IS NULL OR fe.user_id IS DISTINCT FROM p_exclude_user_id)
  );
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
  needs_face boolean;
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
  needs_face := true;

  IF face_embedding IS NOT NULL AND array_length(face_embedding, 1) = 128 THEN
    face_match := public.face_has_existing_match(face_embedding);
    IF face_match THEN
      already_claimed := true;
    END IF;
    INSERT INTO public.facial_embeddings (user_id, embedding)
    VALUES (NEW.id, face_embedding);
    needs_face := false;
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
    needs_face
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_needs_face_verification()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.barbershops s
    WHERE s.owner_id = auth.uid()
      AND s.face_verification_pending = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_needs_face_verification() TO authenticated;

CREATE OR REPLACE FUNCTION public.register_user_facial_embedding(p_embedding real[])
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _match boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF p_embedding IS NULL OR array_length(p_embedding, 1) IS DISTINCT FROM 128 THEN
    RETURN json_build_object('error', 'invalid_embedding', 'trial_eligible', false);
  END IF;

  IF EXISTS (SELECT 1 FROM public.facial_embeddings fe WHERE fe.user_id = auth.uid()) THEN
    UPDATE public.barbershops
    SET face_verification_pending = false
    WHERE owner_id = auth.uid();

    RETURN json_build_object('trial_eligible', true, 'facial_match', false, 'already_registered', true);
  END IF;

  _match := public.face_has_existing_match(p_embedding, auth.uid());

  INSERT INTO public.facial_embeddings (user_id, embedding)
  VALUES (auth.uid(), p_embedding);

  UPDATE public.barbershops
  SET
    face_verification_pending = false,
    subscription_status = CASE
      WHEN _match THEN 'expired'::public.subscription_status
      ELSE subscription_status
    END,
    trial_started_at = CASE
      WHEN _match THEN CURRENT_DATE - 14
      ELSE trial_started_at
    END
  WHERE owner_id = auth.uid();

  RETURN json_build_object(
    'trial_eligible', NOT _match,
    'facial_match', _match
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_user_facial_embedding(real[]) TO authenticated;
