-- Admin: gestão de contas AA (Agregados do Admin).
-- O Admin agrega diretamente via admin_set_admin_aggregated (sets is_admin_aggregated = true).
-- AAs ficam isentos de assinatura e podem agregar CAs como CT normal.
-- Se removidos: perdem isenção e teste gratuito.

-- =============================================================================
-- 1. admin_set_admin_aggregated: transforma uma conta existente em AA
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_set_admin_aggregated(p_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  norm_email    text;
  _target_id    uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  norm_email := lower(trim(p_email));
  IF norm_email IS NULL OR norm_email = '' OR position('@' IN norm_email) = 0 THEN
    RETURN json_build_object('error', 'invalid_email');
  END IF;

  SELECT u.id INTO _target_id
  FROM auth.users u
  WHERE lower(trim(u.email)) = norm_email
  LIMIT 1;

  IF _target_id IS NULL THEN
    RETURN json_build_object('error', 'user_not_found');
  END IF;

  -- Admin não pode virar AA
  IF public.has_role(_target_id, 'admin'::public.app_role) THEN
    RETURN json_build_object('error', 'cannot_set_admin_as_aa');
  END IF;

  -- Quem já é CA ativa não pode virar AA ao mesmo tempo
  IF EXISTS (
    SELECT 1 FROM public.aggregated_accounts aa
    WHERE aa.aggregated_user_id = _target_id
      AND aa.status IN ('awaiting_face', 'active')
  ) THEN
    RETURN json_build_object('error', 'target_is_ca');
  END IF;

  UPDATE public.barbershops
  SET is_admin_aggregated = true
  WHERE owner_id = _target_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'shop_not_found');
  END IF;

  -- Bloqueia teste gratuito futuro da AA
  INSERT INTO public.trial_claims (email, user_id)
  VALUES (norm_email, _target_id)
  ON CONFLICT (email) DO NOTHING;

  RETURN json_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_admin_aggregated(text) TO authenticated;

-- =============================================================================
-- 2. admin_remove_admin_aggregated: remove status AA de uma conta
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_remove_admin_aggregated(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  -- Busca o email para garantir trial bloqueado
  SELECT lower(trim(u.email)) INTO _email
  FROM auth.users u
  WHERE u.id = p_user_id;

  UPDATE public.barbershops
  SET is_admin_aggregated = false
  WHERE owner_id = p_user_id AND is_admin_aggregated = true;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found_or_not_aa');
  END IF;

  -- Garante que trial permanece bloqueado após remoção
  IF _email IS NOT NULL THEN
    INSERT INTO public.trial_claims (email, user_id)
    VALUES (_email, p_user_id)
    ON CONFLICT (email) DO NOTHING;
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_remove_admin_aggregated(uuid) TO authenticated;

-- =============================================================================
-- 3. admin_list_admin_aggregated_accounts: lista todas as contas AA
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_list_admin_aggregated_accounts()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  _rows json;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.set_at DESC), '[]'::json)
  INTO _rows
  FROM (
    SELECT
      s.owner_id                                   AS user_id,
      lower(trim(u.email))                         AS email,
      coalesce(nullif(trim(s.display_name), ''), '—') AS shop_name,
      s.subscription_status,
      p.display_name                               AS profile_name,
      s.updated_at                                 AS set_at
    FROM public.barbershops s
    JOIN auth.users u ON u.id = s.owner_id
    LEFT JOIN public.profiles p ON p.id = s.owner_id
    WHERE s.is_admin_aggregated = true
  ) t;

  RETURN json_build_object('accounts', _rows);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_admin_aggregated_accounts() TO authenticated;
