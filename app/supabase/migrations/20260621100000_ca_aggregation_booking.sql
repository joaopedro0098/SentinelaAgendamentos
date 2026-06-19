-- Etapas 1–4: agregação CA — RLS agendamento público, limite de colaborador,
-- RPC unificada de profissionais e dados do titular em get_my_subscription.

-- =============================================================================
-- Etapa 1 — RLS: insert público na barbearia da CA agregada
-- =============================================================================

CREATE OR REPLACE FUNCTION public.barbearia_allows_public_booking_insert(p_barbearia_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.barbearias b
      WHERE b.id = p_barbearia_id
        AND b.ativa = true
        AND b.allow_client_public_booking = true
    )
    OR EXISTS (
      SELECT 1
      FROM public.barbearias cb
      JOIN public.barbershops cs ON cs.slug = cb.slug AND cs.owner_id = cb.owner_id
      JOIN public.aggregated_accounts aa
        ON aa.aggregated_user_id = cs.owner_id
       AND aa.status = 'active'::public.aggregated_account_status
      JOIN public.barbershops os ON os.owner_id = aa.owner_user_id
      WHERE cb.id = p_barbearia_id
        AND cb.ativa = true
        AND os.allow_client_public_booking = true
    );
$$;

COMMENT ON FUNCTION public.barbearia_allows_public_booking_insert(uuid) IS
  'True se a barbearia aceita insert público: link próprio ativo ou CA agregada com titular (CT/AA) com link ativo.';

GRANT EXECUTE ON FUNCTION public.barbearia_allows_public_booking_insert(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "public insere agendamento" ON public.agendamentos;
CREATE POLICY "public insere agendamento" ON public.agendamentos
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    public.barbearia_pode_agendar(barbearia_id)
    AND status = 'confirmado'::public.agendamento_status
    AND public.barbearia_allows_public_booking_insert(barbearia_id)
  );

-- =============================================================================
-- Etapa 2 — Limite de 1 colaborador ativo por CA agregada
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_ca_active_staff_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _active_count int;
BEGIN
  IF NOT COALESCE(NEW.is_active, true) THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.barbershops bs
    JOIN public.aggregated_accounts aa
      ON aa.aggregated_user_id = bs.owner_id
     AND aa.status = 'active'::public.aggregated_account_status
    WHERE bs.id = NEW.barbershop_id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::int INTO _active_count
  FROM public.staff s
  WHERE s.barbershop_id = NEW.barbershop_id
    AND s.is_active = true
    AND (TG_OP = 'INSERT' OR s.id <> NEW.id);

  IF _active_count >= 1 THEN
    RAISE EXCEPTION 'ca_staff_limit: Contas agregadas (CA) podem ter no máximo 1 colaborador ativo.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_enforce_ca_active_staff_limit ON public.staff;
CREATE TRIGGER tr_enforce_ca_active_staff_limit
  BEFORE INSERT OR UPDATE OF is_active ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_ca_active_staff_limit();

-- =============================================================================
-- Etapa 3 — RPC unificada de profissionais para agendamento
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_booking_professionals(
  p_slug text,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hub_slug text;
  _shop record;
  _is_ca boolean;
  _ca_slug text;
  _barbearia_ids uuid[];
  _result json;
BEGIN
  _hub_slug := trim(p_slug);
  IF _hub_slug = '' THEN
    RETURN '[]'::json;
  END IF;

  SELECT * INTO _shop
  FROM public.barbershops
  WHERE slug = _hub_slug
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN '[]'::json;
  END IF;

  _is_ca := EXISTS (
    SELECT 1
    FROM public.aggregated_accounts aa
    WHERE aa.aggregated_user_id = _shop.owner_id
      AND aa.status = 'active'::public.aggregated_account_status
  );

  PERFORM public.ensure_agenda_from_barbershop_slug(_hub_slug);

  IF _is_ca THEN
    SELECT array_agg(b.id) INTO _barbearia_ids
    FROM public.barbearias b
    WHERE b.slug = _hub_slug
      AND b.ativa = true;
  ELSE
    FOR _ca_slug IN
      SELECT cs.slug
      FROM public.aggregated_accounts aa
      JOIN public.barbershops cs ON cs.owner_id = aa.aggregated_user_id
      WHERE aa.owner_user_id = _shop.owner_id
        AND aa.status = 'active'::public.aggregated_account_status
    LOOP
      PERFORM public.ensure_agenda_from_barbershop_slug(_ca_slug);
    END LOOP;

    SELECT array_agg(DISTINCT b.id) INTO _barbearia_ids
    FROM public.barbearias b
    WHERE b.ativa = true
      AND (
        b.slug = _hub_slug
        OR EXISTS (
          SELECT 1
          FROM public.aggregated_accounts aa
          JOIN public.barbershops cs ON cs.owner_id = aa.aggregated_user_id
          WHERE aa.owner_user_id = _shop.owner_id
            AND aa.status = 'active'::public.aggregated_account_status
            AND cs.slug = b.slug
        )
      );
  END IF;

  IF _barbearia_ids IS NULL OR array_length(_barbearia_ids, 1) IS NULL THEN
    RETURN '[]'::json;
  END IF;

  SELECT COALESCE(json_agg(row ORDER BY source_order, nome), '[]'::json)
  INTO _result
  FROM (
    SELECT
      br.id AS barbeiro_id,
      br.barbearia_id,
      br.nome,
      br.foto_url,
      COALESCE(br.slot_minutos, 30) AS slot_minutos,
      CASE WHEN bb.slug <> _hub_slug THEN 1 ELSE 0 END AS source_order,
      (
        SELECT COALESCE(json_agg(json_build_object(
          'dia_semana', d.dia_semana,
          'hora_inicio', d.hora_inicio,
          'hora_fim', d.hora_fim
        ) ORDER BY d.dia_semana, d.hora_inicio), '[]'::json)
        FROM public.disponibilidades d
        WHERE d.barbeiro_id = br.id
      ) AS disponibilidades,
      (
        SELECT COALESCE(json_agg(json_build_object(
          'data', bl.data,
          'hora_inicio', bl.hora_inicio,
          'hora_fim', bl.hora_fim
        ) ORDER BY bl.data), '[]'::json)
        FROM public.bloqueios bl
        WHERE bl.barbeiro_id = br.id
          AND (p_from IS NULL OR bl.data >= p_from)
          AND (p_to IS NULL OR bl.data <= p_to)
      ) AS bloqueios,
      (
        SELECT COALESCE(json_agg(json_build_object(
          'id', bs.id,
          'nome', bs.nome,
          'duracao_minutos', bs.duracao_minutos
        ) ORDER BY bs.nome), '[]'::json)
        FROM public.barbeiro_services bs
        WHERE bs.barbeiro_id = br.id
          AND bs.ativo = true
      ) AS servicos
    FROM public.barbeiros br
    JOIN public.barbearias bb ON bb.id = br.barbearia_id
    WHERE br.barbearia_id = ANY(_barbearia_ids)
      AND br.ativo = true
  ) row;

  RETURN COALESCE(_result, '[]'::json);
END;
$$;

COMMENT ON FUNCTION public.get_booking_professionals(text, date, date) IS
  'Profissionais para agendamento: hub CT/AA inclui colaboradores das CAs ativas; CA usa só os próprios.';

GRANT EXECUTE ON FUNCTION public.get_booking_professionals(text, date, date) TO anon, authenticated;

-- =============================================================================
-- Etapa 4 — Dados do titular (CT/AA) para exibição na CA
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
      'account_type',                'ca',
      'owner_slug',                    _billing_shop.slug,
      'owner_display_name',            _billing_shop.display_name,
      'owner_avatar_url',              _billing_shop.avatar_url,
      'owner_contact_phone',           COALESCE(_billing_shop.contact_phone, _billing_shop.whatsapp_number),
      'owner_public_booking_enabled',  COALESCE(_billing_shop.allow_client_public_booking, true)
    );
  END IF;

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
