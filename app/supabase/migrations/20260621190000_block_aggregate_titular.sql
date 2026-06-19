-- Impede agregar titular (própria conta ou CT que já agrega outras contas).

CREATE OR REPLACE FUNCTION public.invite_aggregated_account(p_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  norm_email   text;
  _target_user_id uuid;
  _target_shop record;
  _invite_id   uuid;
  _needs_face  boolean;
  _new_status  public.aggregated_account_status;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.aggregated_accounts aa
    WHERE aa.aggregated_user_id = auth.uid()
      AND aa.status IN ('awaiting_face', 'active')
  ) THEN
    RETURN json_build_object('error', 'aggregated_cannot_invite');
  END IF;

  norm_email := lower(trim(p_email));
  IF norm_email IS NULL OR norm_email = '' OR position('@' IN norm_email) = 0 THEN
    RETURN json_build_object('error', 'invalid_email');
  END IF;

  IF EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = auth.uid() AND lower(trim(u.email)) = norm_email
  ) THEN
    RETURN json_build_object('error', 'cannot_aggregate_titular');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.aggregated_accounts aa
    WHERE aa.owner_user_id = auth.uid()
      AND aa.email = norm_email
      AND aa.status IN ('pending', 'awaiting_face', 'active')
  ) THEN
    RETURN json_build_object('error', 'already_invited');
  END IF;

  SELECT u.id INTO _target_user_id
  FROM auth.users u
  WHERE lower(trim(u.email)) = norm_email
  LIMIT 1;

  IF _target_user_id IS NULL THEN
    RETURN json_build_object('error', 'user_not_found');
  END IF;

  IF public.has_role(_target_user_id, 'admin'::public.app_role) THEN
    RETURN json_build_object('error', 'cannot_aggregate_admin');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.barbershops s
    WHERE s.owner_id = _target_user_id AND s.is_admin_aggregated = true
  ) THEN
    RETURN json_build_object('error', 'cannot_aggregate_aa');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.aggregated_accounts aa
    WHERE aa.aggregated_user_id = _target_user_id
      AND aa.status IN ('pending', 'awaiting_face', 'active')
      AND aa.owner_user_id IS DISTINCT FROM auth.uid()
  ) THEN
    RETURN json_build_object('error', 'user_already_aggregated');
  END IF;

  -- Outro titular (CT/AA): já agrega contas ativas/pendentes
  IF EXISTS (
    SELECT 1 FROM public.aggregated_accounts aa
    WHERE aa.owner_user_id = _target_user_id
      AND aa.status IN ('pending', 'awaiting_face', 'active')
  ) THEN
    RETURN json_build_object('error', 'cannot_aggregate_titular');
  END IF;

  SELECT s.face_verification_pending
  INTO _target_shop
  FROM public.barbershops s
  WHERE s.owner_id = _target_user_id
  LIMIT 1;

  _needs_face := coalesce(_target_shop.face_verification_pending, true)
    OR NOT EXISTS (
      SELECT 1 FROM public.facial_embeddings fe WHERE fe.user_id = _target_user_id
    );

  _new_status := CASE
    WHEN _needs_face THEN 'awaiting_face'::public.aggregated_account_status
    ELSE 'active'::public.aggregated_account_status
  END;

  IF _needs_face THEN
    UPDATE public.barbershops
    SET face_verification_pending = true
    WHERE owner_id = _target_user_id;
  END IF;

  INSERT INTO public.trial_claims (email, user_id)
  VALUES (norm_email, _target_user_id)
  ON CONFLICT (email) DO NOTHING;

  UPDATE public.barbershops
  SET allow_client_public_booking = false
  WHERE owner_id = _target_user_id;

  UPDATE public.barbearias b
  SET allow_client_public_booking = false
  FROM public.barbershops s
  WHERE s.owner_id = _target_user_id AND s.slug = b.slug;

  INSERT INTO public.aggregated_accounts (
    owner_user_id, aggregated_user_id, email, status, activated_at
  )
  VALUES (
    auth.uid(),
    _target_user_id,
    norm_email,
    _new_status,
    CASE WHEN _new_status = 'active' THEN now() ELSE NULL END
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO _invite_id;

  IF _invite_id IS NOT NULL THEN
    PERFORM public.purge_ca_staff_for_user(_target_user_id);
  END IF;

  RETURN json_build_object(
    'ok', true,
    'id', _invite_id,
    'status', _new_status,
    'user_exists', true
  );
END;
$$;
