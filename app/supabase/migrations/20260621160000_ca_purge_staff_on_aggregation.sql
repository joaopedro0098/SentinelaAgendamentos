-- CA: ao ser agregada, remove todos os colaboradores existentes (máx. 1 novo depois).

CREATE OR REPLACE FUNCTION public.purge_ca_staff_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shop_id uuid;
  _slug    text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT bs.id, bs.slug
  INTO _shop_id, _slug
  FROM public.barbershops bs
  WHERE bs.owner_id = p_user_id
  LIMIT 1;

  IF _shop_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.staff
  WHERE barbershop_id = _shop_id;

  IF _slug IS NOT NULL THEN
    PERFORM public.ensure_agenda_from_barbershop_slug(_slug);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.purge_ca_staff_for_user(uuid) IS
  'Remove todos os colaboradores da barbearia ao virar CA; sincroniza agenda vazia.';

GRANT EXECUTE ON FUNCTION public.purge_ca_staff_for_user(uuid) TO authenticated;

-- Limite de 1 colaborador total enquanto agregação pendente ou ativa
CREATE OR REPLACE FUNCTION public.enforce_ca_active_staff_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _staff_count int;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.barbershops bs
    JOIN public.aggregated_accounts aa
      ON aa.aggregated_user_id = bs.owner_id
     AND aa.status IN (
       'awaiting_face'::public.aggregated_account_status,
       'active'::public.aggregated_account_status
     )
    WHERE bs.id = NEW.barbershop_id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::int INTO _staff_count
  FROM public.staff s
  WHERE s.barbershop_id = NEW.barbershop_id
    AND (TG_OP = 'INSERT' OR s.id <> NEW.id);

  IF _staff_count >= 1 THEN
    RAISE EXCEPTION 'ca_staff_limit: Contas agregadas (CA) podem ter no máximo 1 colaborador.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- CAs já agregadas com 2+ colaboradores: zera equipe para cumprir a regra
DO $$
DECLARE
  _row record;
  _staff_count int;
BEGIN
  FOR _row IN
    SELECT aa.aggregated_user_id AS user_id, bs.id AS shop_id
    FROM public.aggregated_accounts aa
    JOIN public.barbershops bs ON bs.owner_id = aa.aggregated_user_id
    WHERE aa.status IN (
      'awaiting_face'::public.aggregated_account_status,
      'active'::public.aggregated_account_status
    )
  LOOP
    SELECT count(*)::int INTO _staff_count
    FROM public.staff s
    WHERE s.barbershop_id = _row.shop_id;

    IF _staff_count > 1 THEN
      PERFORM public.purge_ca_staff_for_user(_row.user_id);
    END IF;
  END LOOP;
END $$;

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
    RETURN json_build_object('error', 'cannot_invite_self');
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

CREATE OR REPLACE FUNCTION public.register_user_facial_embedding(p_embedding real[])
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _match boolean;
  _is_aggregated boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF p_embedding IS NULL OR array_length(p_embedding, 1) IS DISTINCT FROM 128 THEN
    RETURN json_build_object('error', 'invalid_embedding', 'trial_eligible', false);
  END IF;

  _is_aggregated := EXISTS (
    SELECT 1
    FROM public.aggregated_accounts aa
    WHERE aa.aggregated_user_id = auth.uid()
      AND aa.status = 'awaiting_face'::public.aggregated_account_status
  );

  IF EXISTS (SELECT 1 FROM public.facial_embeddings fe WHERE fe.user_id = auth.uid()) THEN
    UPDATE public.barbershops
    SET face_verification_pending = false
    WHERE owner_id = auth.uid();

    IF _is_aggregated THEN
      PERFORM public.purge_ca_staff_for_user(auth.uid());
      UPDATE public.aggregated_accounts
      SET status = 'active', activated_at = now()
      WHERE aggregated_user_id = auth.uid()
        AND status = 'awaiting_face'::public.aggregated_account_status;
    END IF;

    RETURN json_build_object('trial_eligible', NOT _is_aggregated, 'facial_match', false, 'already_registered', true);
  END IF;

  _match := public.face_has_existing_match(p_embedding, auth.uid());

  INSERT INTO public.facial_embeddings (user_id, embedding)
  VALUES (auth.uid(), p_embedding);

  UPDATE public.barbershops
  SET
    face_verification_pending = false,
    subscription_status = CASE
      WHEN _is_aggregated OR _match THEN 'expired'::public.subscription_status
      ELSE subscription_status
    END,
    trial_started_at = CASE
      WHEN _is_aggregated OR _match THEN CURRENT_DATE - 14
      ELSE trial_started_at
    END
  WHERE owner_id = auth.uid();

  IF _is_aggregated THEN
    PERFORM public.purge_ca_staff_for_user(auth.uid());
    UPDATE public.aggregated_accounts
    SET status = 'active', activated_at = now()
    WHERE aggregated_user_id = auth.uid()
      AND status = 'awaiting_face'::public.aggregated_account_status;
  END IF;

  RETURN json_build_object(
    'trial_eligible', NOT _is_aggregated AND NOT _match,
    'facial_match', _match,
    'is_aggregated_account', _is_aggregated
  );
END;
$$;
