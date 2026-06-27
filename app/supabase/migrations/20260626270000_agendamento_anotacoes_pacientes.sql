-- Anotações por agendamento concluído, aba Pacientes e permissão titular visualizar anotações.

CREATE TABLE IF NOT EXISTS public.agendamento_anotacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id uuid NOT NULL REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  conteudo text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agendamento_id)
);

COMMENT ON TABLE public.agendamento_anotacoes IS
  'Anotação clínica/atendimento vinculada a um agendamento concluído (1:1).';

ALTER TABLE public.agendamento_anotacoes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.aggregated_accounts
  ADD COLUMN IF NOT EXISTS owner_can_view_annotations boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.aggregated_accounts.owner_can_view_annotations IS
  'Se true, o titular (CT/AA) pode ver anotações/pacientes desta CA. Exige owner_can_view_appointments.';

ALTER TABLE public.aggregated_accounts
  DROP CONSTRAINT IF EXISTS aggregated_accounts_edit_requires_view;

ALTER TABLE public.aggregated_accounts
  ADD CONSTRAINT aggregated_accounts_edit_requires_view
  CHECK (NOT owner_can_edit_appointments OR owner_can_view_appointments);

ALTER TABLE public.aggregated_accounts
  DROP CONSTRAINT IF EXISTS aggregated_accounts_annotations_requires_view;

ALTER TABLE public.aggregated_accounts
  ADD CONSTRAINT aggregated_accounts_annotations_requires_view
  CHECK (NOT owner_can_view_annotations OR owner_can_view_appointments);

CREATE OR REPLACE FUNCTION public.enforce_ca_titular_permission_flags()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.owner_can_view_appointments := true;
    NEW.owner_can_edit_appointments := true;
    NEW.owner_can_view_annotations := true;
  END IF;

  IF NOT NEW.owner_can_view_appointments THEN
    NEW.owner_can_edit_appointments := false;
    NEW.owner_can_view_annotations := false;
  END IF;

  IF NEW.owner_can_edit_appointments THEN
    NEW.owner_can_view_appointments := true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_ca_titular_permission_flags ON public.aggregated_accounts;

CREATE TRIGGER trg_enforce_ca_titular_permission_flags
  BEFORE INSERT OR UPDATE OF owner_can_view_appointments, owner_can_edit_appointments, owner_can_view_annotations
  ON public.aggregated_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_ca_titular_permission_flags();

-- Backfill clientes e cliente_id por barbearia (WhatsApp normalizado).
INSERT INTO public.clientes (barbearia_id, nome, whatsapp)
SELECT DISTINCT
  a.barbearia_id,
  a.cliente_nome,
  regexp_replace(COALESCE(a.cliente_whatsapp, ''), '[^0-9]', '', 'g')
FROM public.agendamentos a
WHERE a.cliente_id IS NULL
  AND length(regexp_replace(COALESCE(a.cliente_whatsapp, ''), '[^0-9]', '', 'g')) >= 10
ON CONFLICT (barbearia_id, whatsapp) DO NOTHING;

UPDATE public.agendamentos a
SET cliente_id = c.id
FROM public.clientes c
WHERE a.cliente_id IS NULL
  AND c.barbearia_id = a.barbearia_id
  AND c.whatsapp = regexp_replace(COALESCE(a.cliente_whatsapp, ''), '[^0-9]', '', 'g');

CREATE INDEX IF NOT EXISTS idx_clientes_whatsapp ON public.clientes (whatsapp);
CREATE INDEX IF NOT EXISTS idx_agendamentos_cliente_id ON public.agendamentos (cliente_id);
CREATE INDEX IF NOT EXISTS idx_agendamento_anotacoes_agendamento_id ON public.agendamento_anotacoes (agendamento_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_barbeiro_cliente ON public.agendamentos (barbeiro_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON public.agendamentos (data);

CREATE OR REPLACE FUNCTION public.painel_barbearia_ids_pacientes_visiveis()
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
      AND aa.owner_can_view_annotations = true
      AND NOT EXISTS (
        SELECT 1
        FROM public.aggregated_accounts self
        WHERE self.aggregated_user_id = auth.uid()
          AND self.status = 'active'::public.aggregated_account_status
      )
  ) v
  WHERE v.id IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.painel_barbearia_ids_pacientes_visiveis() TO authenticated;

COMMENT ON FUNCTION public.painel_barbearia_ids_pacientes_visiveis() IS
  'Barbearias cujos pacientes/anotações o usuário pode ver: própria + CAs com permissão de anotações.';

CREATE OR REPLACE FUNCTION public.painel_pode_escrever_anotacao(p_agendamento_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agendamentos a
    WHERE a.id = p_agendamento_id
      AND a.status = 'concluido'::public.agendamento_status
      AND a.barbearia_id = ANY(public.painel_barbearia_ids_editaveis())
  );
$$;

CREATE OR REPLACE FUNCTION public.painel_pode_ler_anotacao(p_agendamento_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agendamentos a
    WHERE a.id = p_agendamento_id
      AND a.status = 'concluido'::public.agendamento_status
      AND a.barbearia_id = ANY(public.painel_barbearia_ids_pacientes_visiveis())
  );
$$;

GRANT EXECUTE ON FUNCTION public.painel_pode_escrever_anotacao(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.painel_pode_ler_anotacao(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_agendamento_anotacao(p_agendamento_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row record;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF NOT public.painel_pode_ler_anotacao(p_agendamento_id) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  SELECT
    an.id,
    an.conteudo,
    an.updated_at,
    public.painel_pode_escrever_anotacao(p_agendamento_id) AS can_write
  INTO _row
  FROM public.agendamento_anotacoes an
  WHERE an.agendamento_id = p_agendamento_id;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'conteudo', '',
      'can_write', public.painel_pode_escrever_anotacao(p_agendamento_id)
    );
  END IF;

  RETURN json_build_object(
    'id', _row.id,
    'conteudo', _row.conteudo,
    'updated_at', _row.updated_at,
    'can_write', _row.can_write
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_agendamento_anotacao(
  p_agendamento_id uuid,
  p_conteudo text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _conteudo text;
  _row record;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF NOT public.painel_pode_escrever_anotacao(p_agendamento_id) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  _conteudo := trim(COALESCE(p_conteudo, ''));

  INSERT INTO public.agendamento_anotacoes (agendamento_id, conteudo, created_by)
  VALUES (p_agendamento_id, _conteudo, auth.uid())
  ON CONFLICT (agendamento_id)
  DO UPDATE SET
    conteudo = EXCLUDED.conteudo,
    updated_at = now()
  RETURNING id, conteudo, updated_at INTO _row;

  RETURN json_build_object(
    'ok', true,
    'id', _row.id,
    'conteudo', _row.conteudo,
    'updated_at', _row.updated_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_agendamento_anotacao(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_agendamento_anotacao(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_pacientes_painel(p_barbeiro_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_ids uuid[];
  _pacientes json;
  _profissionais json;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  _barbearia_ids := public.painel_barbearia_ids_pacientes_visiveis();

  IF coalesce(array_length(_barbearia_ids, 1), 0) = 0 THEN
    RETURN json_build_object('pacientes', '[]'::json, 'profissionais', '[]'::json);
  END IF;

  SELECT coalesce(json_agg(row_to_json(p) ORDER BY p.ultimo_atendimento DESC, p.cliente_nome), '[]'::json)
  INTO _pacientes
  FROM (
    SELECT
      regexp_replace(a.cliente_whatsapp, '[^0-9]', '', 'g') AS whatsapp_digits,
      (
        SELECT s.cliente_nome
        FROM public.agendamentos s
        WHERE s.barbearia_id = ANY(_barbearia_ids)
          AND s.status = 'concluido'::public.agendamento_status
          AND regexp_replace(s.cliente_whatsapp, '[^0-9]', '', 'g') =
              regexp_replace(a.cliente_whatsapp, '[^0-9]', '', 'g')
          AND (p_barbeiro_id IS NULL OR s.barbeiro_id = p_barbeiro_id)
        ORDER BY s.data DESC, s.hora DESC
        LIMIT 1
      ) AS cliente_nome,
      max(a.data) AS ultimo_atendimento,
      count(*)::int AS total_concluidos,
      count(an.id)::int AS total_anotacoes
    FROM public.agendamentos a
    LEFT JOIN public.agendamento_anotacoes an ON an.agendamento_id = a.id
    WHERE a.barbearia_id = ANY(_barbearia_ids)
      AND a.status = 'concluido'::public.agendamento_status
      AND length(regexp_replace(a.cliente_whatsapp, '[^0-9]', '', 'g')) >= 10
      AND (p_barbeiro_id IS NULL OR a.barbeiro_id = p_barbeiro_id)
    GROUP BY regexp_replace(a.cliente_whatsapp, '[^0-9]', '', 'g')
  ) p;

  SELECT coalesce(json_agg(row_to_json(pr) ORDER BY pr.nome), '[]'::json)
  INTO _profissionais
  FROM (
    SELECT DISTINCT bb.id, bb.nome, bb.barbearia_id
    FROM public.barbeiros bb
    WHERE bb.barbearia_id = ANY(_barbearia_ids)
      AND bb.ativo = true
      AND EXISTS (
        SELECT 1
        FROM public.agendamentos ag
        WHERE ag.barbeiro_id = bb.id
          AND ag.status = 'concluido'::public.agendamento_status
      )
  ) pr;

  RETURN json_build_object(
    'pacientes', _pacientes,
    'profissionais', _profissionais
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_paciente_anotacoes(
  p_whatsapp_digits text,
  p_barbeiro_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_ids uuid[];
  _digits text;
  _items json;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  _digits := regexp_replace(COALESCE(p_whatsapp_digits, ''), '[^0-9]', '', 'g');
  IF length(_digits) < 10 THEN
    RETURN json_build_object('error', 'invalid_whatsapp');
  END IF;

  _barbearia_ids := public.painel_barbearia_ids_pacientes_visiveis();

  SELECT coalesce(json_agg(row_to_json(x) ORDER BY x.data DESC, x.hora DESC), '[]'::json)
  INTO _items
  FROM (
    SELECT
      a.id AS agendamento_id,
      a.data,
      a.hora,
      a.cliente_nome,
      a.cliente_whatsapp,
      a.barbearia_id,
      bb.nome AS barbeiro_nome,
      to_jsonb(coalesce(a.servicos_nomes, ARRAY[]::text[])) AS servicos_nomes,
      an.conteudo AS anotacao_conteudo,
      an.updated_at AS anotacao_updated_at,
      public.painel_pode_escrever_anotacao(a.id) AS can_write
    FROM public.agendamentos a
    JOIN public.barbeiros bb ON bb.id = a.barbeiro_id
    LEFT JOIN public.agendamento_anotacoes an ON an.agendamento_id = a.id
    WHERE a.barbearia_id = ANY(_barbearia_ids)
      AND a.status = 'concluido'::public.agendamento_status
      AND regexp_replace(a.cliente_whatsapp, '[^0-9]', '', 'g') = _digits
      AND (p_barbeiro_id IS NULL OR a.barbeiro_id = p_barbeiro_id)
  ) x;

  RETURN json_build_object('items', _items);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_pacientes_painel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_paciente_anotacoes(text, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.update_ca_titular_appointment_permissions(boolean, boolean);

CREATE OR REPLACE FUNCTION public.update_ca_titular_appointment_permissions(
  p_owner_can_view_appointments boolean,
  p_owner_can_edit_appointments boolean,
  p_owner_can_view_annotations boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _view boolean;
  _edit boolean;
  _annotations boolean;
  _updated_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  _view := coalesce(p_owner_can_view_appointments, false);
  _edit := coalesce(p_owner_can_edit_appointments, false);
  _annotations := coalesce(p_owner_can_view_annotations, false);

  IF _edit THEN
    _view := true;
  END IF;

  IF NOT _view THEN
    _edit := false;
    _annotations := false;
  END IF;

  UPDATE public.aggregated_accounts aa
  SET
    owner_can_view_appointments = _view,
    owner_can_edit_appointments = _edit,
    owner_can_view_annotations = _annotations
  WHERE aa.aggregated_user_id = auth.uid()
    AND aa.status = 'active'::public.aggregated_account_status
  RETURNING aa.id INTO _updated_id;

  IF _updated_id IS NULL THEN
    RETURN json_build_object('error', 'not_aggregated_account');
  END IF;

  RETURN json_build_object(
    'ok', true,
    'owner_can_view_appointments', _view,
    'owner_can_edit_appointments', _edit,
    'owner_can_view_annotations', _annotations
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_ca_titular_appointment_permissions(boolean, boolean, boolean) TO authenticated;

COMMENT ON FUNCTION public.update_ca_titular_appointment_permissions(boolean, boolean, boolean) IS
  'CA define permissões do titular: visualizar/editar agendamentos e visualizar anotações.';

-- get_my_subscription: expõe owner_can_view_annotations para CA.
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
  _has_editable_ca   boolean;
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
      'account_type',                'admin',
      'titular_has_editable_ca_appointments', false
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
    aa.owner_can_edit_appointments,
    aa.owner_can_view_annotations
  INTO _agg
  FROM public.aggregated_accounts aa
  JOIN auth.users ou ON ou.id = aa.owner_user_id
  WHERE aa.aggregated_user_id = auth.uid()
    AND aa.status = 'active'::public.aggregated_account_status
  LIMIT 1;

  _billing_owner_id := COALESCE(_agg.owner_user_id, auth.uid());

  SELECT EXISTS (
    SELECT 1
    FROM public.aggregated_accounts aa
    WHERE aa.owner_user_id = auth.uid()
      AND aa.status = 'active'::public.aggregated_account_status
      AND aa.owner_can_view_appointments = true
      AND aa.owner_can_edit_appointments = true
  )
  INTO _has_editable_ca;

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
      'owner_can_edit_appointments', _agg.owner_can_edit_appointments,
      'owner_can_view_annotations',  _agg.owner_can_view_annotations,
      'titular_has_editable_ca_appointments', false
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
    'account_type',                'ct',
    'titular_has_editable_ca_appointments', _has_editable_ca
  );
END;
$$;
