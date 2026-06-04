-- Contas agregadas: vínculo somente de assinatura do titular; cada conta mantém dados próprios.

CREATE TYPE public.aggregated_account_status AS ENUM (
  'pending',
  'awaiting_face',
  'active',
  'removed'
);

CREATE TABLE public.aggregated_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  aggregated_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  email text NOT NULL,
  status public.aggregated_account_status NOT NULL DEFAULT 'pending',
  invited_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  removed_at timestamptz,
  CONSTRAINT aggregated_accounts_email_normalized CHECK (email = lower(trim(email)))
);

CREATE UNIQUE INDEX aggregated_accounts_owner_email_active
  ON public.aggregated_accounts (owner_user_id, email)
  WHERE status IN ('pending', 'awaiting_face', 'active');

CREATE UNIQUE INDEX aggregated_accounts_one_link_per_user
  ON public.aggregated_accounts (aggregated_user_id)
  WHERE aggregated_user_id IS NOT NULL
    AND status IN ('pending', 'awaiting_face', 'active');

CREATE INDEX aggregated_accounts_email_pending
  ON public.aggregated_accounts (email)
  WHERE status = 'pending';

COMMENT ON TABLE public.aggregated_accounts IS
  'Vínculo titular ↔ conta agregada. Cobrança/agendamento usa assinatura do titular enquanto status = active.';

ALTER TABLE public.aggregated_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY aggregated_accounts_owner_select
  ON public.aggregated_accounts
  FOR SELECT
  TO authenticated
  USING (owner_user_id = auth.uid());

CREATE POLICY aggregated_accounts_member_select
  ON public.aggregated_accounts
  FOR SELECT
  TO authenticated
  USING (aggregated_user_id = auth.uid());

-- ===== Helpers =====

CREATE OR REPLACE FUNCTION public.get_billing_owner_for_shop(_owner_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT aa.owner_user_id
      FROM public.aggregated_accounts aa
      WHERE aa.aggregated_user_id = _owner_id
        AND aa.status = 'active'::public.aggregated_account_status
      LIMIT 1
    ),
    _owner_id
  );
$$;

CREATE OR REPLACE FUNCTION public.user_is_active_aggregated_account(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.aggregated_accounts aa
    WHERE aa.aggregated_user_id = _user_id
      AND aa.status = 'active'::public.aggregated_account_status
  );
$$;

CREATE OR REPLACE FUNCTION public.barbershop_subscription_allows_booking(_owner_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shop record;
BEGIN
  SELECT s.trial_started_at, s.subscription_status, s.current_period_end, s.grace_until
  INTO _shop
  FROM public.barbershops s
  WHERE s.owner_id = _owner_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF public.has_role(_owner_id, 'admin'::public.app_role) THEN
    RETURN true;
  END IF;

  IF _shop.subscription_status = 'trial' THEN
    RETURN CURRENT_DATE < (_shop.trial_started_at + 14);
  END IF;

  IF _shop.subscription_status = 'active' THEN
    RETURN _shop.current_period_end IS NULL OR CURRENT_DATE <= (_shop.current_period_end + 3);
  END IF;

  IF _shop.subscription_status = 'cancelled' THEN
    RETURN _shop.current_period_end IS NOT NULL AND CURRENT_DATE <= _shop.current_period_end;
  END IF;

  IF _shop.subscription_status = 'grace' THEN
    RETURN _shop.grace_until IS NOT NULL AND CURRENT_DATE <= _shop.grace_until;
  END IF;

  RETURN false;
END;
$$;

-- ===== Agendamento: agregado usa assinatura do titular =====

CREATE OR REPLACE FUNCTION public.barbearia_pode_agendar(_barbearia_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia record;
  _billing_owner_id uuid;
BEGIN
  SELECT b.ativa, s.owner_id
  INTO _barbearia
  FROM public.barbearias b
  JOIN public.barbershops s ON s.slug = b.slug
  WHERE b.id = _barbearia_id;

  IF NOT FOUND OR NOT _barbearia.ativa THEN
    RETURN false;
  END IF;

  _billing_owner_id := public.get_billing_owner_for_shop(_barbearia.owner_id);

  RETURN public.barbershop_subscription_allows_booking(_billing_owner_id);
END;
$$;

-- ===== Convite / listagem / remoção =====

CREATE OR REPLACE FUNCTION public.invite_aggregated_account(p_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  norm_email text;
  _target_user_id uuid;
  _target_shop record;
  _invite_id uuid;
  _needs_face boolean;
  _new_status public.aggregated_account_status;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.aggregated_accounts aa
    WHERE aa.aggregated_user_id = auth.uid()
      AND aa.status IN ('awaiting_face', 'active')
  ) THEN
    RETURN json_build_object('error', 'aggregated_cannot_invite');
  END IF;

  norm_email := lower(trim(p_email));
  IF norm_email IS NULL OR norm_email = '' OR position('@' in norm_email) = 0 THEN
    RETURN json_build_object('error', 'invalid_email');
  END IF;

  IF EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = auth.uid() AND lower(trim(u.email)) = norm_email
  ) THEN
    RETURN json_build_object('error', 'cannot_invite_self');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.aggregated_accounts aa
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

  IF _target_user_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.aggregated_accounts aa
      WHERE aa.aggregated_user_id = _target_user_id
        AND aa.status IN ('pending', 'awaiting_face', 'active')
        AND aa.owner_user_id IS DISTINCT FROM auth.uid()
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
      auth.uid(),
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
  VALUES (auth.uid(), norm_email, 'pending')
  RETURNING id INTO _invite_id;

  RETURN json_build_object('ok', true, 'id', _invite_id, 'status', 'pending', 'user_exists', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_aggregated_accounts()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  _rows json;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
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
    WHERE aa.owner_user_id = auth.uid()
      AND aa.status IN ('pending', 'awaiting_face', 'active')
  ) t;

  RETURN json_build_object('accounts', _rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_aggregated_account(p_account_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  UPDATE public.aggregated_accounts
  SET
    status = 'removed',
    removed_at = now()
  WHERE id = p_account_id
    AND owner_user_id = auth.uid()
    AND status IN ('pending', 'awaiting_face', 'active');

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

-- ===== Assinatura própria remove vínculo de agregação =====

CREATE OR REPLACE FUNCTION public.detach_aggregated_account_on_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.subscription_status = 'active'::public.subscription_status
     AND (OLD.subscription_status IS DISTINCT FROM 'active'::public.subscription_status) THEN
    UPDATE public.aggregated_accounts
    SET status = 'removed', removed_at = now()
    WHERE aggregated_user_id = NEW.owner_id
      AND status = 'active'::public.aggregated_account_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_detach_aggregated_on_subscription ON public.barbershops;
CREATE TRIGGER trg_detach_aggregated_on_subscription
  AFTER UPDATE OF subscription_status ON public.barbershops
  FOR EACH ROW
  EXECUTE FUNCTION public.detach_aggregated_account_on_subscription();

-- ===== Signup: convite pendente → conta agregada sem trial =====

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
BEGIN
  norm_email := lower(trim(NEW.email));
  auth_provider := coalesce(NEW.raw_app_meta_data->>'provider', '');

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

-- ===== Verificação facial ativa agregação =====

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

GRANT EXECUTE ON FUNCTION public.invite_aggregated_account(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_aggregated_accounts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_aggregated_account(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_active_aggregated_account(uuid) TO authenticated;

-- ===== get_my_subscription: agregado usa plano do titular =====

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
  _agg record;
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

  SELECT aa.owner_user_id, lower(trim(ou.email)) AS owner_email
  INTO _agg
  FROM public.aggregated_accounts aa
  JOIN auth.users ou ON ou.id = aa.owner_user_id
  WHERE aa.aggregated_user_id = auth.uid()
    AND aa.status = 'active'::public.aggregated_account_status
  LIMIT 1;

  _billing_owner_id := auth.uid();
  IF _agg.owner_user_id IS NOT NULL THEN
    _billing_owner_id := _agg.owner_user_id;
  END IF;

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

  IF _agg.owner_user_id IS NOT NULL THEN
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
      'subscription_notice', _billing_shop.subscription_notice,
      'mp_subscription_id', _billing_shop.mp_subscription_id,
      'stripe_subscription_id', _shop.stripe_subscription_id,
      'plan_price_label', 'R$ 29,90/mês',
      'is_aggregated_account', true,
      'aggregated_by_email', _agg.owner_email,
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
    'can_manage_aggregated_accounts', NOT EXISTS (
      SELECT 1
      FROM public.aggregated_accounts aa
      WHERE aa.aggregated_user_id = auth.uid()
        AND aa.status IN ('awaiting_face', 'active')
    )
  );
END;
$$;
