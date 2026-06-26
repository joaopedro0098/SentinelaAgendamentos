-- CA controla se o titular (CT/AA) visualiza ou edita agendamentos da CA agregada.

ALTER TABLE public.aggregated_accounts
  ADD COLUMN IF NOT EXISTS owner_can_view_appointments boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS owner_can_edit_appointments boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.aggregated_accounts.owner_can_view_appointments IS
  'Se true, o titular (CT/AA) vê agendamentos desta CA no painel e relatórios.';

COMMENT ON COLUMN public.aggregated_accounts.owner_can_edit_appointments IS
  'Se true, o titular (CT/AA) pode alterar agendamentos desta CA. Exige owner_can_view_appointments.';

ALTER TABLE public.aggregated_accounts
  DROP CONSTRAINT IF EXISTS aggregated_accounts_edit_requires_view;

ALTER TABLE public.aggregated_accounts
  ADD CONSTRAINT aggregated_accounts_edit_requires_view
  CHECK (NOT owner_can_edit_appointments OR owner_can_view_appointments);

CREATE OR REPLACE FUNCTION public.enforce_ca_titular_permission_flags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_can_edit_appointments THEN
    NEW.owner_can_view_appointments := true;
  END IF;

  IF NOT NEW.owner_can_view_appointments THEN
    NEW.owner_can_edit_appointments := false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_enforce_ca_titular_permission_flags ON public.aggregated_accounts;
CREATE TRIGGER tr_enforce_ca_titular_permission_flags
  BEFORE INSERT OR UPDATE OF owner_can_view_appointments, owner_can_edit_appointments
  ON public.aggregated_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_ca_titular_permission_flags();

-- =============================================================================
-- Painel: visibilidade e edição respeitam permissões da CA
-- =============================================================================

CREATE OR REPLACE FUNCTION public.painel_barbearia_ids_visiveis()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT v.id), ARRAY[]::uuid[])
  FROM (
    SELECT b.id
    FROM public.barbearias b
    JOIN public.barbershops s ON s.slug = b.slug
    WHERE s.owner_id = auth.uid()

    UNION

    SELECT b.id
    FROM public.aggregated_accounts aa
    JOIN public.barbershops cs ON cs.owner_id = aa.aggregated_user_id
    JOIN public.barbearias b ON b.slug = cs.slug
    WHERE aa.owner_user_id = auth.uid()
      AND aa.status = 'active'::public.aggregated_account_status
      AND aa.owner_can_view_appointments = true
      AND NOT EXISTS (
        SELECT 1
        FROM public.aggregated_accounts self
        WHERE self.aggregated_user_id = auth.uid()
          AND self.status = 'active'::public.aggregated_account_status
      )
  ) v
  WHERE v.id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.painel_barbearia_ids_editaveis()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT b.id), ARRAY[]::uuid[])
  FROM public.barbearias b
  JOIN public.barbershops s ON s.slug = b.slug
  WHERE s.owner_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.painel_barbearia_ids_agendamentos_editaveis()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT v.id), ARRAY[]::uuid[])
  FROM (
    SELECT b.id
    FROM public.barbearias b
    JOIN public.barbershops s ON s.slug = b.slug
    WHERE s.owner_id = auth.uid()

    UNION

    SELECT b.id
    FROM public.aggregated_accounts aa
    JOIN public.barbershops cs ON cs.owner_id = aa.aggregated_user_id
    JOIN public.barbearias b ON b.slug = cs.slug
    WHERE aa.owner_user_id = auth.uid()
      AND aa.status = 'active'::public.aggregated_account_status
      AND aa.owner_can_view_appointments = true
      AND aa.owner_can_edit_appointments = true
      AND NOT EXISTS (
        SELECT 1
        FROM public.aggregated_accounts self
        WHERE self.aggregated_user_id = auth.uid()
          AND self.status = 'active'::public.aggregated_account_status
      )
  ) v
  WHERE v.id IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.painel_barbearia_ids_agendamentos_editaveis() TO authenticated;

COMMENT ON FUNCTION public.painel_barbearia_ids_editaveis() IS
  'Barbearias editáveis no painel (bloqueios, etc.): somente titular direto da barbearia.';

COMMENT ON FUNCTION public.painel_barbearia_ids_agendamentos_editaveis() IS
  'Barbearias cujos agendamentos o titular pode alterar: própria + CAs com permissão de edição.';

CREATE OR REPLACE FUNCTION public.painel_pode_gerenciar_agendamento(p_barbearia_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_barbearia_id = ANY(public.painel_barbearia_ids_agendamentos_editaveis());
$$;

COMMENT ON FUNCTION public.painel_pode_gerenciar_agendamento(uuid) IS
  'True se o usuário pode alterar agendamentos desta barbearia (própria ou CA com permissão de edição).';

COMMENT ON FUNCTION public.painel_barbearia_ids_visiveis() IS
  'Barbearias visíveis no painel: titular direto + CAs ativas com permissão de visualização.';

DROP POLICY IF EXISTS "owner updates agendamentos" ON public.agendamentos;
CREATE POLICY "owner updates agendamentos" ON public.agendamentos
  FOR UPDATE TO authenticated
  USING (
    barbearia_id = ANY(public.painel_barbearia_ids_agendamentos_editaveis())
  );

-- can_manage no painel usa agendamentos editáveis (não bloqueios).
CREATE OR REPLACE FUNCTION public.get_agendamentos_painel(
  p_data_inicio date,
  p_data_fim    date
)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_ids                    uuid[];
  _barbearia_ids_agendamentos_edit  uuid[];
  _items                            json;
  _profissionais                    json;
  _total                            int;
  _confirmados                      int;
  _aguardando                       int;
  _cancelados                       int;
  _faturamento                      bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF p_data_inicio IS NULL OR p_data_fim IS NULL OR p_data_fim < p_data_inicio THEN
    RETURN json_build_object('error', 'invalid_dates');
  END IF;

  _barbearia_ids := public.painel_barbearia_ids_visiveis();
  _barbearia_ids_agendamentos_edit := public.painel_barbearia_ids_agendamentos_editaveis();

  IF array_length(_barbearia_ids, 1) IS NULL OR array_length(_barbearia_ids, 1) = 0 THEN
    RETURN json_build_object(
      'items', '[]'::json,
      'profissionais', '[]'::json,
      'summary', json_build_object(
        'total', 0,
        'confirmados', 0,
        'aguardando_confirmacao', 0,
        'cancelados', 0,
        'faturamento_centavos', 0
      )
    );
  END IF;

  PERFORM public.expirar_agendamentos_nao_confirmados(_barbearia_ids);

  SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.data, t.hora, t.barbeiro_nome), '[]'::json)
  INTO _items
  FROM (
    SELECT
      a.id,
      a.data,
      to_char(a.hora, 'HH24:MI') AS hora,
      a.cliente_nome,
      a.cliente_whatsapp,
      a.duracao_minutos,
      coalesce(a.servicos_nomes, ARRAY[]::text[]) AS servicos_nomes,
      a.observacao,
      a.barbeiro_id,
      coalesce(br.nome, 'Colaborador') AS barbeiro_nome,
      a.barbearia_id,
      a.confirmation_token,
      a.client_confirmed_at,
      coalesce(a.requires_client_confirmation, false) AS requires_client_confirmation,
      a.status::text AS status,
      (a.barbearia_id = ANY(_barbearia_ids_agendamentos_edit)) AS can_manage
    FROM public.agendamentos a
    LEFT JOIN public.barbeiros br ON br.id = a.barbeiro_id
    WHERE a.barbearia_id = ANY(_barbearia_ids)
      AND a.data BETWEEN p_data_inicio AND p_data_fim
      AND a.status IN (
        'confirmado'::public.agendamento_status,
        'cancelado'::public.agendamento_status,
        'nao_veio'::public.agendamento_status
      )
  ) t;

  SELECT coalesce(json_agg(row_to_json(p) ORDER BY p.nome), '[]'::json)
  INTO _profissionais
  FROM (
    SELECT br.id, br.nome, br.barbearia_id
    FROM public.barbeiros br
    WHERE br.barbearia_id = ANY(_barbearia_ids)
      AND br.ativo = true

    UNION

    SELECT DISTINCT br.id, coalesce(br.nome, 'Colaborador'), a.barbearia_id
    FROM public.agendamentos a
    LEFT JOIN public.barbeiros br ON br.id = a.barbeiro_id
    WHERE a.barbearia_id = ANY(_barbearia_ids)
      AND a.data BETWEEN p_data_inicio AND p_data_fim
      AND a.status IN (
        'confirmado'::public.agendamento_status,
        'cancelado'::public.agendamento_status,
        'nao_veio'::public.agendamento_status
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.barbeiros bx
        WHERE bx.id = a.barbeiro_id AND bx.ativo = true
      )
  ) p;

  SELECT count(*)::int INTO _total
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status IN (
      'confirmado'::public.agendamento_status,
      'cancelado'::public.agendamento_status,
      'nao_veio'::public.agendamento_status
    );

  SELECT count(*)::int INTO _confirmados
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'confirmado'::public.agendamento_status
    AND (
      NOT coalesce(a.requires_client_confirmation, false)
      OR a.client_confirmed_at IS NOT NULL
    );

  SELECT count(*)::int INTO _aguardando
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'confirmado'::public.agendamento_status
    AND coalesce(a.requires_client_confirmation, false)
    AND a.client_confirmed_at IS NULL;

  SELECT count(*)::int INTO _cancelados
  FROM public.agendamentos a
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'cancelado'::public.agendamento_status;

  SELECT coalesce(sum(sub.faturamento), 0)
  INTO _faturamento
  FROM public.agendamentos a
  LEFT JOIN LATERAL (
    SELECT coalesce(sum(coalesce(bs.preco_centavos, 0)), 0) AS faturamento
    FROM unnest(coalesce(a.servicos_nomes, ARRAY[]::text[])) AS sn(nome)
    LEFT JOIN public.barbeiro_services bs
      ON bs.barbeiro_id = a.barbeiro_id
     AND bs.nome = sn.nome
     AND bs.ativo = true
  ) sub ON true
  WHERE a.barbearia_id = ANY(_barbearia_ids)
    AND a.data BETWEEN p_data_inicio AND p_data_fim
    AND a.status = 'confirmado'::public.agendamento_status
    AND (
      NOT coalesce(a.requires_client_confirmation, false)
      OR a.client_confirmed_at IS NOT NULL
    );

  RETURN json_build_object(
    'items', _items,
    'profissionais', _profissionais,
    'summary', json_build_object(
      'total', _total,
      'confirmados', _confirmados,
      'aguardando_confirmacao', _aguardando,
      'cancelados', _cancelados,
      'faturamento_centavos', _faturamento
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.expirar_agendamentos_nao_confirmados_painel()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_ids uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;

  _barbearia_ids := public.painel_barbearia_ids_visiveis();

  IF array_length(_barbearia_ids, 1) IS NULL OR array_length(_barbearia_ids, 1) = 0 THEN
    RETURN 0;
  END IF;

  RETURN public.expirar_agendamentos_nao_confirmados(_barbearia_ids);
END;
$$;

-- CA atualiza permissões do titular sobre seus agendamentos.
CREATE OR REPLACE FUNCTION public.update_ca_titular_appointment_permissions(
  p_owner_can_view_appointments boolean,
  p_owner_can_edit_appointments boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _view boolean;
  _edit boolean;
  _updated_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  _view := coalesce(p_owner_can_view_appointments, false);
  _edit := coalesce(p_owner_can_edit_appointments, false);

  IF _edit THEN
    _view := true;
  END IF;

  IF NOT _view THEN
    _edit := false;
  END IF;

  UPDATE public.aggregated_accounts aa
  SET
    owner_can_view_appointments = _view,
    owner_can_edit_appointments = _edit
  WHERE aa.aggregated_user_id = auth.uid()
    AND aa.status = 'active'::public.aggregated_account_status
  RETURNING aa.id INTO _updated_id;

  IF _updated_id IS NULL THEN
    RETURN json_build_object('error', 'not_aggregated_account');
  END IF;

  RETURN json_build_object(
    'ok', true,
    'owner_can_view_appointments', _view,
    'owner_can_edit_appointments', _edit
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_ca_titular_appointment_permissions(boolean, boolean) TO authenticated;

COMMENT ON FUNCTION public.update_ca_titular_appointment_permissions(boolean, boolean) IS
  'CA ativa: define se o titular visualiza/edita agendamentos desta conta. Editar exige visualizar.';

-- get_my_subscription: expõe permissões atuais para a CA.
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
  _agg               record;
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

  SELECT
    aa.owner_user_id,
    lower(trim(ou.email)) AS owner_email,
    aa.owner_can_view_appointments,
    aa.owner_can_edit_appointments
  INTO _agg
  FROM public.aggregated_accounts aa
  JOIN auth.users ou ON ou.id = aa.owner_user_id
  WHERE aa.aggregated_user_id = auth.uid()
    AND aa.status = 'active'::public.aggregated_account_status
  LIMIT 1;

  _billing_owner_id := COALESCE(_agg.owner_user_id, auth.uid());

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

  IF _agg.owner_user_id IS NOT NULL THEN
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
      'aggregated_by_email',         _agg.owner_email,
      'can_manage_aggregated_accounts', false,
      'account_type',                'ca',
      'owner_slug',                  _billing_shop.slug,
      'owner_display_name',          _billing_shop.display_name,
      'owner_avatar_url',            _billing_shop.avatar_url,
      'owner_contact_phone',         COALESCE(_billing_shop.contact_phone, _billing_shop.whatsapp_number),
      'owner_public_booking_enabled', COALESCE(_billing_shop.allow_client_public_booking, true),
      'owner_can_view_appointments', _agg.owner_can_view_appointments,
      'owner_can_edit_appointments', _agg.owner_can_edit_appointments
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

-- Bloqueios no hub: oculta dados de CA quando titular não pode visualizar agendamentos.
CREATE OR REPLACE FUNCTION public.get_bloqueios_painel(
  p_barbershop_id uuid,
  p_from          date,
  p_to            date
)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _slug text;
  _hoje date;
  _is_viewer_ca boolean;
  _result json;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF NOT public.painel_pode_ver_barbershop(p_barbershop_id) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  SELECT bs.slug INTO _slug
  FROM public.barbershops bs
  WHERE bs.id = p_barbershop_id
  LIMIT 1;

  IF _slug IS NULL THEN
    RETURN json_build_object('error', 'shop_not_found');
  END IF;

  PERFORM public.ensure_agenda_from_barbershop_slug(_slug);

  _hoje := (timezone('America/Sao_Paulo', now()))::date;

  _is_viewer_ca := EXISTS (
    SELECT 1
    FROM public.aggregated_accounts aa
    JOIN public.barbershops bs ON bs.owner_id = aa.aggregated_user_id
    WHERE bs.id = p_barbershop_id
      AND aa.status = 'active'::public.aggregated_account_status
  );

  SELECT json_build_object(
    'profissionais', COALESCE((
      SELECT json_agg(json_build_object(
        'staff_id', s.id,
        'nome', s.name,
        'barbeiro_id', br.id,
        'slot_minutos', COALESCE(br.slot_minutos, 30),
        'disponibilidades', (
          SELECT COALESCE(json_agg(json_build_object(
            'dia_semana', d.dia_semana,
            'hora_inicio', d.hora_inicio,
            'hora_fim', d.hora_fim
          ) ORDER BY d.dia_semana, d.hora_inicio), '[]'::json)
          FROM public.disponibilidades d
          WHERE d.barbeiro_id = br.id
        )
      ) ORDER BY s.sort_order, s.name)
      FROM public.staff s
      JOIN public.barbeiros br ON br.staff_id = s.id
      WHERE s.barbershop_id = p_barbershop_id
        AND s.is_active = true
    ), '[]'::json),
    'bloqueios', COALESCE((
      SELECT json_agg(json_build_object(
        'id', bx.id,
        'barbeiro_id', bx.barbeiro_id,
        'nome', bx.nome,
        'data', bx.data,
        'hora_inicio', bx.hora_inicio,
        'hora_fim', bx.hora_fim,
        'motivo', bx.motivo,
        'observacao', bx.observacao,
        'is_ca', bx.is_ca
      ) ORDER BY bx.data, bx.is_ca, bx.nome, bx.hora_inicio NULLS FIRST)
      FROM (
        SELECT
          bl.id,
          br.id AS barbeiro_id,
          s.name AS nome,
          bl.data,
          bl.hora_inicio,
          bl.hora_fim,
          bl.motivo,
          bl.observacao,
          false AS is_ca
        FROM public.bloqueios bl
        JOIN public.barbeiros br ON br.id = bl.barbeiro_id
        JOIN public.staff s ON s.id = br.staff_id
        WHERE s.barbershop_id = p_barbershop_id
          AND s.is_active = true
          AND bl.data BETWEEN p_from AND p_to

        UNION ALL

        SELECT
          bl.id,
          br.id AS barbeiro_id,
          s.name AS nome,
          bl.data,
          bl.hora_inicio,
          bl.hora_fim,
          bl.motivo,
          bl.observacao,
          true AS is_ca
        FROM public.bloqueios bl
        JOIN public.barbeiros br ON br.id = bl.barbeiro_id
        JOIN public.staff s ON s.id = br.staff_id
        JOIN public.barbershops cs ON cs.id = s.barbershop_id
        JOIN public.aggregated_accounts aa
          ON aa.aggregated_user_id = cs.owner_id
         AND aa.status = 'active'::public.aggregated_account_status
         AND aa.owner_can_view_appointments = true
        JOIN public.barbershops hub ON hub.id = p_barbershop_id
          AND hub.owner_id = aa.owner_user_id
        WHERE NOT _is_viewer_ca
          AND s.is_active = true
          AND bl.data BETWEEN p_from AND p_to
      ) bx
    ), '[]'::json),
    'ferias_programadas', COALESCE((
      SELECT json_agg(json_build_object(
        'barbeiro_id', fp.barbeiro_id,
        'nome', fp.nome,
        'data_inicio', fp.data_inicio,
        'data_fim', fp.data_fim,
        'is_ca', fp.is_ca
      ) ORDER BY fp.is_ca, fp.nome, fp.data_inicio)
      FROM (
        WITH ferias_dias_proprios AS (
          SELECT
            br.id AS barbeiro_id,
            s.name AS nome,
            bl.data,
            bl.data - (ROW_NUMBER() OVER (PARTITION BY br.id ORDER BY bl.data))::int AS grp
          FROM public.bloqueios bl
          JOIN public.barbeiros br ON br.id = bl.barbeiro_id
          JOIN public.staff s ON s.id = br.staff_id
          WHERE s.barbershop_id = p_barbershop_id
            AND s.is_active = true
            AND bl.motivo = 'ferias'
            AND bl.hora_inicio IS NULL
            AND bl.hora_fim IS NULL
        ),
        periodos_proprios AS (
          SELECT
            barbeiro_id,
            nome,
            MIN(data) AS data_inicio,
            MAX(data) AS data_fim,
            false AS is_ca
          FROM ferias_dias_proprios
          GROUP BY barbeiro_id, nome, grp
        ),
        ferias_dias_ca AS (
          SELECT
            br.id AS barbeiro_id,
            s.name AS nome,
            bl.data,
            bl.data - (ROW_NUMBER() OVER (PARTITION BY br.id ORDER BY bl.data))::int AS grp
          FROM public.bloqueios bl
          JOIN public.barbeiros br ON br.id = bl.barbeiro_id
          JOIN public.staff s ON s.id = br.staff_id
          JOIN public.barbershops cs ON cs.id = s.barbershop_id
          JOIN public.aggregated_accounts aa
            ON aa.aggregated_user_id = cs.owner_id
           AND aa.status = 'active'::public.aggregated_account_status
           AND aa.owner_can_view_appointments = true
          JOIN public.barbershops hub ON hub.id = p_barbershop_id
            AND hub.owner_id = aa.owner_user_id
          WHERE NOT _is_viewer_ca
            AND s.is_active = true
            AND bl.motivo = 'ferias'
            AND bl.hora_inicio IS NULL
            AND bl.hora_fim IS NULL
        ),
        periodos_ca AS (
          SELECT
            barbeiro_id,
            nome,
            MIN(data) AS data_inicio,
            MAX(data) AS data_fim,
            true AS is_ca
          FROM ferias_dias_ca
          GROUP BY barbeiro_id, nome, grp
        )
        SELECT * FROM periodos_proprios WHERE data_fim >= _hoje
        UNION ALL
        SELECT * FROM periodos_ca WHERE data_fim >= _hoje
      ) fp
    ), '[]'::json)
  ) INTO _result;

  RETURN _result;
END;
$$;
