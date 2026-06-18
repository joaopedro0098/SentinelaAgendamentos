-- Tipos de conta: CT (titular), CA (agregado de CT), AA (agregado do admin), Admin.
-- Restabelece invite/list/remove para CT e AA; adiciona lógica de link público;
-- add account_type em get_my_subscription; atualiza RLS e RPCs de agendamento.

-- =============================================================================
-- 1. Coluna is_admin_aggregated em barbershops
-- =============================================================================

ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS is_admin_aggregated boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.barbershops.is_admin_aggregated IS
  'AA: conta isenta de assinatura gerenciada diretamente pelo admin. Pode agregar CAs como um CT.';

-- =============================================================================
-- 2. barbershop_subscription_allows_booking: AA sempre pode agendar
-- =============================================================================

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
  SELECT s.trial_started_at, s.subscription_status, s.current_period_end, s.grace_until, s.is_admin_aggregated
  INTO _shop
  FROM public.barbershops s
  WHERE s.owner_id = _owner_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Admin e AA sempre podem agendar
  IF public.has_role(_owner_id, 'admin'::public.app_role) OR _shop.is_admin_aggregated THEN
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

-- =============================================================================
-- 3. invite_aggregated_account: restaurado para CT/AA
--    Novo: alvo DEVE já existir; sem verificação de assinatura própria;
--    desativa link público da CA ao agregar.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.invite_aggregated_account(p_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
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

  -- CA e agregados de AA não podem convidar
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

  -- Alvo DEVE existir no sistema
  SELECT u.id INTO _target_user_id
  FROM auth.users u
  WHERE lower(trim(u.email)) = norm_email
  LIMIT 1;

  IF _target_user_id IS NULL THEN
    RETURN json_build_object('error', 'user_not_found');
  END IF;

  -- Não pode agregar admin
  IF public.has_role(_target_user_id, 'admin'::public.app_role) THEN
    RETURN json_build_object('error', 'cannot_aggregate_admin');
  END IF;

  -- Não pode agregar um AA
  IF EXISTS (
    SELECT 1 FROM public.barbershops s
    WHERE s.owner_id = _target_user_id AND s.is_admin_aggregated = true
  ) THEN
    RETURN json_build_object('error', 'cannot_aggregate_aa');
  END IF;

  -- Não pode agregar quem já é CA de outro titular
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

  -- Bloqueia teste gratuito futuro da CA (ela já usou o sistema)
  INSERT INTO public.trial_claims (email, user_id)
  VALUES (norm_email, _target_user_id)
  ON CONFLICT (email) DO NOTHING;

  -- Desativa link público da CA (Opção A MVP)
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

  RETURN json_build_object(
    'ok', true,
    'id', _invite_id,
    'status', _new_status,
    'user_exists', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_aggregated_account(text) TO authenticated;

-- =============================================================================
-- 4. list_my_aggregated_accounts: re-concede execução para CT/AA
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.list_my_aggregated_accounts() TO authenticated;

-- =============================================================================
-- 5. remove_aggregated_account: restaura link público da CA e bloqueia trial
-- =============================================================================

CREATE OR REPLACE FUNCTION public.remove_aggregated_account(p_account_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _agg_email    text;
  _agg_user_id  uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  -- Captura dados antes de remover
  SELECT aa.email, aa.aggregated_user_id
  INTO _agg_email, _agg_user_id
  FROM public.aggregated_accounts aa
  WHERE aa.id = p_account_id
    AND aa.owner_user_id = auth.uid()
    AND aa.status IN ('pending', 'awaiting_face', 'active');

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  UPDATE public.aggregated_accounts
  SET status = 'removed', removed_at = now()
  WHERE id = p_account_id;

  -- Garante que o trial fica bloqueado (perda permanente do teste gratuito)
  IF _agg_email IS NOT NULL THEN
    INSERT INTO public.trial_claims (email, user_id)
    VALUES (_agg_email, _agg_user_id)
    ON CONFLICT (email) DO NOTHING;
  END IF;

  -- Restaura link público individual da CA desagregada
  IF _agg_user_id IS NOT NULL THEN
    UPDATE public.barbershops
    SET allow_client_public_booking = true
    WHERE owner_id = _agg_user_id;

    UPDATE public.barbearias b
    SET allow_client_public_booking = true
    FROM public.barbershops s
    WHERE s.owner_id = _agg_user_id AND s.slug = b.slug;
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_aggregated_account(uuid) TO authenticated;

-- =============================================================================
-- 6. ct_list_ca_info: retorna infos das CAs ativas para o frontend montar a
--    lista de barbearias que o CT pode ver em Agendamentos.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ct_list_ca_info()
RETURNS TABLE (barbearia_id uuid, slug text, shop_display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id, s.slug, s.display_name
  FROM public.aggregated_accounts aa
  JOIN public.barbershops s ON s.owner_id = aa.aggregated_user_id
  JOIN public.barbearias b ON b.slug = s.slug
  WHERE aa.owner_user_id = auth.uid()
    AND aa.status = 'active'::public.aggregated_account_status;
$$;

GRANT EXECUTE ON FUNCTION public.ct_list_ca_info() TO authenticated;

-- =============================================================================
-- 7. get_my_subscription: adiciona account_type; corrige can_manage_aggregated_accounts
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_my_subscription()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  _shop              record;
  _billing_shop      record;
  _trial_end         date;
  _trial_days_left   int;
  _can_book          boolean;
  _barbearia_id      uuid;
  _email             text;
  _trial_already_used boolean;
  _facial_trial_used  boolean;
  _my_embedding      real[];
  _agg_owner_id      uuid;
  _agg_owner_email   text;
  _billing_owner_id  uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN json_build_object(
      'is_admin',                    true,
      'can_book',                    true,
      'subscription_status',         'active',
      'trial_already_used',          false,
      'facial_trial_used',           false,
      'label',                       'Administrador — acesso ilimitado',
      'is_aggregated_account',       false,
      'can_manage_aggregated_accounts', true,
      'account_type',                'admin'
    );
  END IF;

  SELECT s.* INTO _shop
  FROM public.barbershops s
  WHERE s.owner_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'no_shop', 'can_book', false);
  END IF;

  -- Verifica se é CA (está agregado a algum titular)
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

  _trial_end       := _shop.trial_started_at + 13;
  _trial_days_left := GREATEST(0, (_shop.trial_started_at + 14) - CURRENT_DATE);

  -- === CA: usa assinatura do titular ===
  IF _agg_owner_id IS NOT NULL THEN
    _trial_days_left := GREATEST(0, (_billing_shop.trial_started_at + 14) - CURRENT_DATE);
    _trial_end       := _billing_shop.trial_started_at + 13;

    RETURN json_build_object(
      'is_admin',                    false,
      'can_book',                    _can_book,
      'subscription_status',         _billing_shop.subscription_status,
      'trial_started_at',            _billing_shop.trial_started_at,
      'trial_days_left',             _trial_days_left,
      'trial_last_day',              _trial_end,
      'trial_already_used',          true,
      'facial_trial_used',           _facial_trial_used,
      'current_period_end',          _billing_shop.current_period_end,
      'grace_until',                 _billing_shop.grace_until,
      'subscription_notice',         CASE
        WHEN _can_book THEN NULL
        ELSE COALESCE(
          _billing_shop.subscription_notice,
          'O plano de quem agregou sua conta está inativo. Novos agendamentos estão bloqueados.'
        )
      END,
      'mp_subscription_id',          _billing_shop.mp_subscription_id,
      'stripe_subscription_id',      _shop.stripe_subscription_id,
      'plan_price_label',            'R$ 29,90/mês',
      'is_aggregated_account',       true,
      'aggregated_by_email',         _agg_owner_email,
      'can_manage_aggregated_accounts', false,
      'account_type',                'ca'
    );
  END IF;

  -- === AA: conta especial agregada pelo admin ===
  IF _shop.is_admin_aggregated THEN
    RETURN json_build_object(
      'is_admin',                    false,
      'can_book',                    _can_book,
      'subscription_status',         'active',
      'trial_already_used',          true,
      'facial_trial_used',           _facial_trial_used,
      'label',                       'Conta especial — acesso garantido pelo administrador',
      'plan_price_label',            'R$ 29,90/mês',
      'is_aggregated_account',       false,
      'can_manage_aggregated_accounts', true,
      'account_type',                'aa'
    );
  END IF;

  -- === CT: titular normal ===
  RETURN json_build_object(
    'is_admin',                    false,
    'can_book',                    _can_book,
    'subscription_status',         _shop.subscription_status,
    'trial_started_at',            _shop.trial_started_at,
    'trial_days_left',             _trial_days_left,
    'trial_last_day',              _trial_end,
    'trial_already_used',          _trial_already_used,
    'facial_trial_used',           _facial_trial_used,
    'current_period_end',          _shop.current_period_end,
    'grace_until',                 _shop.grace_until,
    'subscription_notice',         _shop.subscription_notice,
    'mp_subscription_id',          _shop.mp_subscription_id,
    'stripe_subscription_id',      _shop.stripe_subscription_id,
    'plan_price_label',            'R$ 29,90/mês',
    'is_aggregated_account',       false,
    'can_manage_aggregated_accounts', true,
    'account_type',                'ct'
  );
END;
$$;

-- =============================================================================
-- 8. RLS agendamentos: CT/AA pode ler e atualizar agendamentos das suas CAs
-- =============================================================================

DROP POLICY IF EXISTS "owner reads agendamentos" ON public.agendamentos;
CREATE POLICY "owner reads agendamentos" ON public.agendamentos
  FOR SELECT TO authenticated
  USING (
    public.agendamento_dentro_retencao(data)
    AND (
      -- Dono direto da barbearia
      EXISTS (
        SELECT 1 FROM public.barbearias b
        WHERE b.id = barbearia_id AND b.owner_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.barbearias b
        INNER JOIN public.barbershops s ON s.slug = b.slug
        WHERE b.id = barbearia_id AND s.owner_id = auth.uid()
      )
      -- CT/AA: lê agendamentos das suas CAs ativas
      OR EXISTS (
        SELECT 1
        FROM public.aggregated_accounts aa
        JOIN public.barbershops cs ON cs.owner_id = aa.aggregated_user_id
        JOIN public.barbearias cb ON cb.slug = cs.slug
        WHERE aa.owner_user_id = auth.uid()
          AND aa.status = 'active'::public.aggregated_account_status
          AND cb.id = barbearia_id
      )
    )
  );

DROP POLICY IF EXISTS "owner updates agendamentos" ON public.agendamentos;
CREATE POLICY "owner updates agendamentos" ON public.agendamentos
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.barbearias b
      WHERE b.id = barbearia_id AND b.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.barbearias b
      INNER JOIN public.barbershops s ON s.slug = b.slug
      WHERE b.id = barbearia_id AND s.owner_id = auth.uid()
    )
    -- CT/AA: atualiza agendamentos das suas CAs ativas
    OR EXISTS (
      SELECT 1
      FROM public.aggregated_accounts aa
      JOIN public.barbershops cs ON cs.owner_id = aa.aggregated_user_id
      JOIN public.barbearias cb ON cb.slug = cs.slug
      WHERE aa.owner_user_id = auth.uid()
        AND aa.status = 'active'::public.aggregated_account_status
        AND cb.id = barbearia_id
    )
  );

-- =============================================================================
-- 9. reagendar_agendamento: CT/AA pode reagendar agendamentos das CAs
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reagendar_agendamento(
  p_agendamento_id   uuid,
  p_data             date,
  p_hora             time,
  p_barbeiro_id      uuid,
  p_duracao_minutos  int,
  p_observacao       text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT a.barbearia_id INTO _barbearia_id
  FROM public.agendamentos a
  WHERE a.id = p_agendamento_id AND a.status = 'confirmado';

  IF _barbearia_id IS NULL THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.barbearias b
    WHERE b.id = _barbearia_id AND b.owner_id = auth.uid()
    UNION ALL
    SELECT 1 FROM public.barbearias b
    INNER JOIN public.barbershops s ON s.slug = b.slug
    WHERE b.id = _barbearia_id AND s.owner_id = auth.uid()
    UNION ALL
    -- CT/AA: pode reagendar de suas CAs
    SELECT 1
    FROM public.aggregated_accounts aa
    JOIN public.barbershops cs ON cs.owner_id = aa.aggregated_user_id
    JOIN public.barbearias cb ON cb.slug = cs.slug
    WHERE aa.owner_user_id = auth.uid()
      AND aa.status = 'active'::public.aggregated_account_status
      AND cb.id = _barbearia_id
  ) THEN
    RAISE EXCEPTION 'Sem permissão para alterar este agendamento';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.barbeiros bb
    WHERE bb.id = p_barbeiro_id AND bb.barbearia_id = _barbearia_id AND bb.ativo = true
  ) THEN
    RAISE EXCEPTION 'Colaborador inválido';
  END IF;

  IF p_duracao_minutos IS NULL OR p_duracao_minutos < 1 THEN
    RAISE EXCEPTION 'Duração inválida';
  END IF;

  UPDATE public.agendamentos
  SET
    data              = p_data,
    hora              = p_hora,
    barbeiro_id       = p_barbeiro_id,
    duracao_minutos   = p_duracao_minutos,
    observacao        = NULLIF(trim(COALESCE(p_observacao, observacao)), '')
  WHERE id = p_agendamento_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reagendar_agendamento(uuid, date, time, uuid, int, text) TO authenticated;

-- =============================================================================
-- 10. excluir_agendamento_painel: CT/AA pode excluir agendamentos das CAs
-- =============================================================================

CREATE OR REPLACE FUNCTION public.excluir_agendamento_painel(p_agendamento_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT a.barbearia_id INTO _barbearia_id
  FROM public.agendamentos a
  WHERE a.id = p_agendamento_id AND a.status = 'confirmado';

  IF _barbearia_id IS NULL THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.barbearias b
    WHERE b.id = _barbearia_id AND b.owner_id = auth.uid()
    UNION ALL
    SELECT 1 FROM public.barbearias b
    INNER JOIN public.barbershops s ON s.slug = b.slug
    WHERE b.id = _barbearia_id AND s.owner_id = auth.uid()
    UNION ALL
    -- CT/AA: pode excluir de suas CAs
    SELECT 1
    FROM public.aggregated_accounts aa
    JOIN public.barbershops cs ON cs.owner_id = aa.aggregated_user_id
    JOIN public.barbearias cb ON cb.slug = cs.slug
    WHERE aa.owner_user_id = auth.uid()
      AND aa.status = 'active'::public.aggregated_account_status
      AND cb.id = _barbearia_id
  ) THEN
    RAISE EXCEPTION 'Sem permissão para excluir este agendamento';
  END IF;

  DELETE FROM public.agendamentos
  WHERE id = p_agendamento_id;
END;
$$;

COMMENT ON FUNCTION public.excluir_agendamento_painel(uuid) IS
  'Painel: remove o agendamento. CT/AA também podem excluir agendamentos das suas CAs.';

-- =============================================================================
-- 11. confirmar_presenca_agendamento_painel: CT/AA pode confirmar das CAs
-- =============================================================================

CREATE OR REPLACE FUNCTION public.confirmar_presenca_agendamento_painel(p_agendamento_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_id  uuid;
  _confirmed_at  timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT a.barbearia_id, a.client_confirmed_at
  INTO _barbearia_id, _confirmed_at
  FROM public.agendamentos a
  WHERE a.id = p_agendamento_id AND a.status = 'confirmado';

  IF _barbearia_id IS NULL THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.barbearias b
    WHERE b.id = _barbearia_id AND b.owner_id = auth.uid()
    UNION ALL
    SELECT 1 FROM public.barbearias b
    INNER JOIN public.barbershops s ON s.slug = b.slug
    WHERE b.id = _barbearia_id AND s.owner_id = auth.uid()
    UNION ALL
    -- CT/AA: pode confirmar de suas CAs
    SELECT 1
    FROM public.aggregated_accounts aa
    JOIN public.barbershops cs ON cs.owner_id = aa.aggregated_user_id
    JOIN public.barbearias cb ON cb.slug = cs.slug
    WHERE aa.owner_user_id = auth.uid()
      AND aa.status = 'active'::public.aggregated_account_status
      AND cb.id = _barbearia_id
  ) THEN
    RAISE EXCEPTION 'Sem permissão para confirmar este agendamento';
  END IF;

  IF _confirmed_at IS NOT NULL THEN
    RETURN _confirmed_at;
  END IF;

  UPDATE public.agendamentos
  SET client_confirmed_at = now()
  WHERE id = p_agendamento_id
  RETURNING client_confirmed_at INTO _confirmed_at;

  RETURN _confirmed_at;
END;
$$;

COMMENT ON FUNCTION public.confirmar_presenca_agendamento_painel(uuid) IS
  'Painel: marca client_confirmed_at. CT/AA também podem confirmar de suas CAs.';

GRANT EXECUTE ON FUNCTION public.confirmar_presenca_agendamento_painel(uuid) TO authenticated;
