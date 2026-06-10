-- Contas agregadas: gestão apenas pelo admin (remove acesso dos titulares).

REVOKE EXECUTE ON FUNCTION public.invite_aggregated_account(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.list_my_aggregated_accounts() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.remove_aggregated_account(uuid) FROM authenticated;

CREATE OR REPLACE FUNCTION public.admin_invite_aggregated_account(p_owner_email text, p_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  norm_owner_email text;
  norm_email text;
  _owner_id uuid;
  _target_user_id uuid;
  _target_shop record;
  _invite_id uuid;
  _needs_face boolean;
  _new_status public.aggregated_account_status;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  norm_owner_email := lower(trim(p_owner_email));
  norm_email := lower(trim(p_email));

  IF norm_owner_email IS NULL OR norm_owner_email = '' OR position('@' in norm_owner_email) = 0 THEN
    RETURN json_build_object('error', 'invalid_owner_email');
  END IF;

  IF norm_email IS NULL OR norm_email = '' OR position('@' in norm_email) = 0 THEN
    RETURN json_build_object('error', 'invalid_email');
  END IF;

  IF norm_owner_email = norm_email THEN
    RETURN json_build_object('error', 'cannot_invite_self');
  END IF;

  SELECT u.id INTO _owner_id
  FROM auth.users u
  WHERE lower(trim(u.email)) = norm_owner_email
  LIMIT 1;

  IF _owner_id IS NULL THEN
    RETURN json_build_object('error', 'owner_not_found');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.aggregated_accounts aa
    WHERE aa.aggregated_user_id = _owner_id
      AND aa.status IN ('awaiting_face', 'active')
  ) THEN
    RETURN json_build_object('error', 'owner_is_aggregated');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.aggregated_accounts aa
    WHERE aa.owner_user_id = _owner_id
      AND aa.email = norm_email
      AND aa.status IN ('pending', 'awaiting_face', 'active')
  ) THEN
    RETURN json_build_object('error', 'already_invited');
  END IF;

  SELECT u.id INTO _target_user_id
  FROM auth.users u
  WHERE lower(trim(u.email)) = norm_email
  LIMIT 1;

  IF _target_user_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.aggregated_accounts aa
      WHERE aa.aggregated_user_id = _target_user_id
        AND aa.status IN ('pending', 'awaiting_face', 'active')
        AND aa.owner_user_id IS DISTINCT FROM _owner_id
    ) THEN
      RETURN json_build_object('error', 'user_already_aggregated');
    END IF;

    SELECT s.subscription_status, s.face_verification_pending
    INTO _target_shop
    FROM public.barbershops s
    WHERE s.owner_id = _target_user_id
    LIMIT 1;

    IF _target_shop.subscription_status IN ('active', 'grace', 'cancelled') THEN
      RETURN json_build_object('error', 'user_has_own_subscription');
    END IF;

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

    INSERT INTO public.aggregated_accounts (
      owner_user_id, aggregated_user_id, email, status, activated_at
    )
    VALUES (
      _owner_id,
      _target_user_id,
      norm_email,
      _new_status,
      CASE WHEN _new_status = 'active' THEN now() ELSE NULL END
    )
    RETURNING id INTO _invite_id;

    RETURN json_build_object(
      'ok', true,
      'id', _invite_id,
      'status', _new_status,
      'user_exists', true
    );
  END IF;

  INSERT INTO public.aggregated_accounts (owner_user_id, email, status)
  VALUES (_owner_id, norm_email, 'pending')
  RETURNING id INTO _invite_id;

  RETURN json_build_object('ok', true, 'id', _invite_id, 'status', 'pending', 'user_exists', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_aggregated_accounts(p_owner_email text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  _owner_id uuid;
  _rows json;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  SELECT u.id INTO _owner_id
  FROM auth.users u
  WHERE lower(trim(u.email)) = lower(trim(p_owner_email))
  LIMIT 1;

  IF _owner_id IS NULL THEN
    RETURN json_build_object('error', 'owner_not_found', 'accounts', '[]'::json);
  END IF;

  SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.invited_at DESC), '[]'::json)
  INTO _rows
  FROM (
    SELECT
      aa.id,
      aa.email,
      aa.status,
      aa.invited_at,
      aa.activated_at,
      aa.removed_at,
      p.display_name AS aggregated_display_name
    FROM public.aggregated_accounts aa
    LEFT JOIN public.profiles p ON p.id = aa.aggregated_user_id
    WHERE aa.owner_user_id = _owner_id
      AND aa.status IN ('pending', 'awaiting_face', 'active')
  ) t;

  RETURN json_build_object('accounts', _rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_remove_aggregated_account(p_account_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  UPDATE public.aggregated_accounts
  SET
    status = 'removed',
    removed_at = now()
  WHERE id = p_account_id
    AND status IN ('pending', 'awaiting_face', 'active');

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_invite_aggregated_account(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_aggregated_accounts(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_aggregated_account(uuid) TO authenticated;

-- Titulares comuns não gerenciam mais contas agregadas.
CREATE OR REPLACE FUNCTION public.get_my_subscription()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  _shop record;
  _billing_shop record;
  _trial_end date;
  _trial_days_left int;
  _can_book boolean;
  _barbearia_id uuid;
  _email text;
  _trial_already_used boolean;
  _facial_trial_used boolean;
  _my_embedding real[];
  _agg_owner_id uuid;
  _agg_owner_email text;
  _billing_owner_id uuid;
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
      'label', 'Administrador — acesso ilimitado',
      'is_aggregated_account', false,
      'can_manage_aggregated_accounts', true
    );
  END IF;

  SELECT s.* INTO _shop
  FROM public.barbershops s
  WHERE s.owner_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'no_shop', 'can_book', false);
  END IF;

  SELECT aa.owner_user_id, lower(trim(ou.email))
  INTO _agg_owner_id, _agg_owner_email
  FROM public.aggregated_accounts aa
  JOIN auth.users ou ON ou.id = aa.owner_user_id
  WHERE aa.aggregated_user_id = auth.uid()
    AND aa.status = 'active'::public.aggregated_account_status
  LIMIT 1;

  _billing_owner_id := COALESCE(_agg_owner_id, auth.uid());

  SELECT s.* INTO _billing_shop
  FROM public.barbershops s
  WHERE s.owner_id = _billing_owner_id
  LIMIT 1;

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

  _can_book := _barbearia_id IS NOT NULL
    AND public.barbearia_pode_agendar(_barbearia_id);

  _trial_end := _shop.trial_started_at + 13;
  _trial_days_left := GREATEST(0, (_shop.trial_started_at + 14) - CURRENT_DATE);

  IF _agg_owner_id IS NOT NULL THEN
    _trial_days_left := GREATEST(0, (_billing_shop.trial_started_at + 14) - CURRENT_DATE);
    _trial_end := _billing_shop.trial_started_at + 13;

    RETURN json_build_object(
      'is_admin', false,
      'can_book', _can_book,
      'subscription_status', _billing_shop.subscription_status,
      'trial_started_at', _billing_shop.trial_started_at,
      'trial_days_left', _trial_days_left,
      'trial_last_day', _trial_end,
      'trial_already_used', true,
      'facial_trial_used', _facial_trial_used,
      'current_period_end', _billing_shop.current_period_end,
      'grace_until', _billing_shop.grace_until,
      'subscription_notice', CASE
        WHEN _can_book THEN NULL
        ELSE COALESCE(
          _billing_shop.subscription_notice,
          'O plano de quem agregou sua conta está inativo. Novos agendamentos estão bloqueados.'
        )
      END,
      'mp_subscription_id', _billing_shop.mp_subscription_id,
      'stripe_subscription_id', _shop.stripe_subscription_id,
      'plan_price_label', 'R$ 29,90/mês',
      'is_aggregated_account', true,
      'aggregated_by_email', _agg_owner_email,
      'can_manage_aggregated_accounts', false,
      'own_subscription_status', _shop.subscription_status
    );
  END IF;

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
    'stripe_subscription_id', _shop.stripe_subscription_id,
    'plan_price_label', 'R$ 29,90/mês',
    'is_aggregated_account', false,
    'can_manage_aggregated_accounts', false
  );
END;
$$;
