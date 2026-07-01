-- Fase 1: Mercado Pago agendamentos — schema, painel, OAuth state, helpers CT/CA.

DO $$ BEGIN
  CREATE TYPE public.mp_connect_status AS ENUM ('not_connected', 'connected', 'token_expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.appointment_payment_mode AS ENUM ('none', 'deposit', 'full');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.appointment_deposit_type AS ENUM ('percent', 'fixed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.appointment_payment_status AS ENUM (
    'pending', 'paid', 'failed', 'cancelled', 'pending_resolution'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS mp_user_id bigint,
  ADD COLUMN IF NOT EXISTS mp_access_token text,
  ADD COLUMN IF NOT EXISTS mp_refresh_token text,
  ADD COLUMN IF NOT EXISTS mp_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS mp_connect_status public.mp_connect_status NOT NULL DEFAULT 'not_connected',
  ADD COLUMN IF NOT EXISTS mp_live_mode boolean,
  ADD COLUMN IF NOT EXISTS payments_centralized boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS appointment_payment_mode public.appointment_payment_mode NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS appointment_deposit_type public.appointment_deposit_type,
  ADD COLUMN IF NOT EXISTS appointment_deposit_value int,
  ADD COLUMN IF NOT EXISTS payment_enable_card boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS payment_enable_pix boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS payment_pass_fee_card boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_pass_fee_pix boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_max_installments smallint;

COMMENT ON COLUMN public.barbershops.payments_centralized IS
  'CT: se true, CAs usam conta MP e regras do titular.';
COMMENT ON COLUMN public.barbershops.payment_max_installments IS
  'Máximo de parcelas no cartão (1–12). NULL trata como 1x.';

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS mp_payment_id text,
  ADD COLUMN IF NOT EXISTS payment_status public.appointment_payment_status,
  ADD COLUMN IF NOT EXISTS valor_pago_centavos int,
  ADD COLUMN IF NOT EXISTS valor_base_centavos int,
  ADD COLUMN IF NOT EXISTS valor_restante_centavos int,
  ADD COLUMN IF NOT EXISTS payment_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS installment_count smallint;

CREATE INDEX IF NOT EXISTS idx_agendamentos_mp_payment_id
  ON public.agendamentos (mp_payment_id)
  WHERE mp_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agendamentos_aguardando_pagamento_expires
  ON public.agendamentos (payment_expires_at)
  WHERE status = 'aguardando_pagamento'::public.agendamento_status;

DROP INDEX IF EXISTS public.agendamentos_barbeiro_data_hora_confirmado_key;
DROP INDEX IF EXISTS public.agendamentos_barbeiro_data_hora_ocupado_key;

CREATE UNIQUE INDEX IF NOT EXISTS agendamentos_barbeiro_data_hora_ocupado_key
  ON public.agendamentos (barbeiro_id, data, hora)
  WHERE status IN (
    'confirmado'::public.agendamento_status,
    'aguardando_pagamento'::public.agendamento_status
  );

CREATE TABLE IF NOT EXISTS public.mp_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state text NOT NULL UNIQUE,
  code_verifier text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes')
);

CREATE INDEX IF NOT EXISTS idx_mp_oauth_states_expires
  ON public.mp_oauth_states (expires_at);

ALTER TABLE public.mp_oauth_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no public mp oauth states" ON public.mp_oauth_states;
CREATE POLICY "no public mp oauth states"
  ON public.mp_oauth_states FOR ALL USING (false) WITH CHECK (false);

CREATE TABLE IF NOT EXISTS public.mp_payment_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  agendamento_id uuid REFERENCES public.agendamentos(id) ON DELETE SET NULL,
  mp_payment_id text NOT NULL,
  amount_centavos int NOT NULL,
  reason text NOT NULL DEFAULT 'late_pix_after_hold_expired',
  status text NOT NULL DEFAULT 'pending_resolution',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_mp_payment_exceptions_barbearia_pending
  ON public.mp_payment_exceptions (barbearia_id, created_at DESC)
  WHERE status = 'pending_resolution';

ALTER TABLE public.mp_payment_exceptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no public mp payment exceptions" ON public.mp_payment_exceptions;
CREATE POLICY "no public mp payment exceptions"
  ON public.mp_payment_exceptions FOR ALL USING (false) WITH CHECK (false);

-- =============================================================================
-- Helpers CT / CA
-- =============================================================================

CREATE OR REPLACE FUNCTION public.shop_id_for_barbearia(p_barbearia_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id
  FROM public.barbearias b
  JOIN public.barbershops s ON s.slug = b.slug
  WHERE b.id = p_barbearia_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.titular_shop_id_for_shop(p_shop_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT ts.id
      FROM public.barbershops cs
      JOIN public.aggregated_accounts aa
        ON aa.aggregated_user_id = cs.owner_id
       AND aa.status = 'active'::public.aggregated_account_status
      JOIN public.barbershops ts ON ts.owner_id = aa.owner_user_id
      WHERE cs.id = p_shop_id
      LIMIT 1
    ),
    p_shop_id
  );
$$;

CREATE OR REPLACE FUNCTION public.payment_destination_shop_id(p_barbearia_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH shop AS (
    SELECT public.shop_id_for_barbearia(p_barbearia_id) AS id
  ),
  titular AS (
    SELECT public.titular_shop_id_for_shop(s.id) AS id FROM shop s
  ),
  ca AS (
    SELECT s.id AS ca_shop_id, t.id AS titular_shop_id
    FROM shop s CROSS JOIN titular t
    WHERE s.id IS DISTINCT FROM t.id
  )
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM ca) THEN
      CASE
        WHEN (SELECT ts.payments_centralized FROM public.barbershops ts JOIN titular t ON t.id = ts.id) THEN
          (SELECT titular_shop_id FROM ca)
        ELSE (SELECT ca_shop_id FROM ca)
      END
    ELSE (SELECT id FROM shop)
  END;
$$;

CREATE OR REPLACE FUNCTION public.mp_credentials_shop_id(p_barbearia_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.payment_destination_shop_id(p_barbearia_id);
$$;

GRANT EXECUTE ON FUNCTION public.shop_id_for_barbearia(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.titular_shop_id_for_shop(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payment_destination_shop_id(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mp_credentials_shop_id(uuid) TO anon, authenticated, service_role;

-- =============================================================================
-- Painel Pagamentos
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_payment_panel_settings()
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _shop public.barbershops%ROWTYPE;
  _titular_shop public.barbershops%ROWTYPE;
  _is_ca boolean := false;
  _is_ct boolean := false;
  _ca_readonly boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  SELECT s.* INTO _shop
  FROM public.barbershops s
  WHERE s.owner_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'no_shop');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.aggregated_accounts aa
    WHERE aa.aggregated_user_id = auth.uid()
      AND aa.status = 'active'::public.aggregated_account_status
  ) INTO _is_ca;

  _is_ct := NOT _is_ca AND EXISTS (
    SELECT 1 FROM public.aggregated_accounts aa
    WHERE aa.owner_user_id = auth.uid()
      AND aa.status = 'active'::public.aggregated_account_status
  );

  IF _is_ca THEN
    SELECT ts.* INTO _titular_shop
    FROM public.barbershops ts
    WHERE ts.id = public.titular_shop_id_for_shop(_shop.id);

    IF coalesce(_titular_shop.payments_centralized, true) THEN
      _ca_readonly := true;
      RETURN json_build_object(
        'role', 'ca',
        'ca_readonly', true,
        'payments_centralized', true,
        'readonly_message',
          'Titular centralizou os pagamentos. Para receber na sua conta MP, solicite que habilitem a função ou desagregue sua conta.'
      );
    END IF;
  END IF;

  RETURN json_build_object(
    'role', CASE WHEN _is_ca THEN 'ca' WHEN _is_ct THEN 'ct' ELSE 'owner' END,
    'ca_readonly', false,
    'shop_id', _shop.id,
    'payments_centralized', coalesce(_shop.payments_centralized, true),
    'can_edit_centralization', _is_ct OR (NOT _is_ca AND NOT _is_ct),
    'mp_connect_status', _shop.mp_connect_status::text,
    'mp_user_id', _shop.mp_user_id,
    'mp_live_mode', _shop.mp_live_mode,
    'mp_connected', _shop.mp_connect_status = 'connected'::public.mp_connect_status
      AND _shop.mp_access_token IS NOT NULL,
    'appointment_payment_mode', _shop.appointment_payment_mode::text,
    'appointment_deposit_type', _shop.appointment_deposit_type::text,
    'appointment_deposit_value', _shop.appointment_deposit_value,
    'payment_enable_card', _shop.payment_enable_card,
    'payment_enable_pix', _shop.payment_enable_pix,
    'payment_pass_fee_card', _shop.payment_pass_fee_card,
    'payment_pass_fee_pix', _shop.payment_pass_fee_pix,
    'payment_max_installments', _shop.payment_max_installments
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_payment_panel_settings(
  p_payments_centralized boolean DEFAULT NULL,
  p_appointment_payment_mode text DEFAULT NULL,
  p_appointment_deposit_type text DEFAULT NULL,
  p_appointment_deposit_value int DEFAULT NULL,
  p_payment_enable_card boolean DEFAULT NULL,
  p_payment_enable_pix boolean DEFAULT NULL,
  p_payment_pass_fee_card boolean DEFAULT NULL,
  p_payment_pass_fee_pix boolean DEFAULT NULL,
  p_payment_max_installments int DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _shop public.barbershops%ROWTYPE;
  _titular_shop public.barbershops%ROWTYPE;
  _is_ca boolean := false;
  _mode public.appointment_payment_mode;
  _dep_type public.appointment_deposit_type;
  _max_inst smallint;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  SELECT s.* INTO _shop FROM public.barbershops s WHERE s.owner_id = auth.uid() LIMIT 1;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'no_shop');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.aggregated_accounts aa
    WHERE aa.aggregated_user_id = auth.uid()
      AND aa.status = 'active'::public.aggregated_account_status
  ) INTO _is_ca;

  IF _is_ca THEN
    SELECT ts.* INTO _titular_shop
    FROM public.barbershops ts
    WHERE ts.id = public.titular_shop_id_for_shop(_shop.id);

    IF coalesce(_titular_shop.payments_centralized, true) THEN
      RETURN json_build_object(
        'error', 'ca_readonly',
        'message', 'Titular centralizou os pagamentos.'
      );
    END IF;
  END IF;

  IF p_payments_centralized IS NOT NULL AND NOT _is_ca THEN
    UPDATE public.barbershops SET payments_centralized = p_payments_centralized WHERE id = _shop.id;
  END IF;

  IF p_appointment_payment_mode IS NOT NULL THEN
    _mode := p_appointment_payment_mode::public.appointment_payment_mode;
    IF _mode = 'deposit'::public.appointment_payment_mode THEN
      _dep_type := coalesce(p_appointment_deposit_type, _shop.appointment_deposit_type, 'percent'::public.appointment_deposit_type);
      IF _dep_type = 'percent'::public.appointment_deposit_type
        AND (p_appointment_deposit_value IS NULL OR p_appointment_deposit_value < 1 OR p_appointment_deposit_value > 100) THEN
        RETURN json_build_object('error', 'invalid_deposit_percent');
      END IF;
      IF _dep_type = 'fixed'::public.appointment_deposit_type
        AND (p_appointment_deposit_value IS NULL OR p_appointment_deposit_value < 50) THEN
        RETURN json_build_object('error', 'invalid_deposit_fixed');
      END IF;
    END IF;
  END IF;

  IF p_payment_max_installments IS NOT NULL THEN
    _max_inst := CASE
      WHEN p_payment_max_installments < 1 THEN NULL
      ELSE LEAST(GREATEST(p_payment_max_installments, 1), 12)::smallint
    END;
  END IF;

  UPDATE public.barbershops
  SET
    appointment_payment_mode = coalesce(_mode, appointment_payment_mode),
    appointment_deposit_type = CASE
      WHEN p_appointment_payment_mode = 'deposit' THEN coalesce(_dep_type, appointment_deposit_type)
      WHEN p_appointment_payment_mode IN ('none', 'full') THEN NULL
      ELSE appointment_deposit_type
    END,
    appointment_deposit_value = CASE
      WHEN p_appointment_payment_mode = 'deposit' THEN coalesce(p_appointment_deposit_value, appointment_deposit_value)
      WHEN p_appointment_payment_mode IN ('none', 'full') THEN NULL
      ELSE appointment_deposit_value
    END,
    payment_enable_card = coalesce(p_payment_enable_card, payment_enable_card),
    payment_enable_pix = coalesce(p_payment_enable_pix, payment_enable_pix),
    payment_pass_fee_card = coalesce(p_payment_pass_fee_card, payment_pass_fee_card),
    payment_pass_fee_pix = coalesce(p_payment_pass_fee_pix, payment_pass_fee_pix),
    payment_max_installments = coalesce(_max_inst, payment_max_installments),
    updated_at = now()
  WHERE id = _shop.id;

  RETURN public.get_payment_panel_settings();
END;
$$;

CREATE OR REPLACE FUNCTION public.disconnect_mp_account()
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _shop public.barbershops%ROWTYPE;
  _titular_shop public.barbershops%ROWTYPE;
  _is_ca boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  SELECT s.* INTO _shop FROM public.barbershops s WHERE s.owner_id = auth.uid() LIMIT 1;
  IF NOT FOUND THEN RETURN json_build_object('error', 'no_shop'); END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.aggregated_accounts aa
    WHERE aa.aggregated_user_id = auth.uid()
      AND aa.status = 'active'::public.aggregated_account_status
  ) INTO _is_ca;

  IF _is_ca THEN
    SELECT ts.* INTO _titular_shop
    FROM public.barbershops ts WHERE ts.id = public.titular_shop_id_for_shop(_shop.id);
    IF coalesce(_titular_shop.payments_centralized, true) THEN
      RETURN json_build_object('error', 'ca_readonly');
    END IF;
  END IF;

  UPDATE public.barbershops
  SET
    mp_user_id = NULL,
    mp_access_token = NULL,
    mp_refresh_token = NULL,
    mp_token_expires_at = NULL,
    mp_live_mode = NULL,
    mp_connect_status = 'not_connected'::public.mp_connect_status,
    updated_at = now()
  WHERE id = _shop.id;

  RETURN public.get_payment_panel_settings();
END;
$$;

CREATE OR REPLACE FUNCTION public.save_mp_oauth_tokens(
  p_shop_id uuid,
  p_user_id uuid,
  p_mp_user_id bigint,
  p_access_token text,
  p_refresh_token text,
  p_expires_in int,
  p_live_mode boolean
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.barbershops s WHERE s.id = p_shop_id AND s.owner_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'shop_not_found';
  END IF;

  UPDATE public.barbershops
  SET
    mp_user_id = p_mp_user_id,
    mp_access_token = p_access_token,
    mp_refresh_token = p_refresh_token,
    mp_token_expires_at = now() + make_interval(secs => GREATEST(coalesce(p_expires_in, 15552000), 300)),
    mp_live_mode = p_live_mode,
    mp_connect_status = 'connected'::public.mp_connect_status,
    updated_at = now()
  WHERE id = p_shop_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_mp_oauth_state(p_shop_id uuid, p_state text, p_code_verifier text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.barbershops s WHERE s.id = p_shop_id AND s.owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'shop_not_found';
  END IF;

  DELETE FROM public.mp_oauth_states WHERE shop_id = p_shop_id OR expires_at < now();

  INSERT INTO public.mp_oauth_states (shop_id, user_id, state, code_verifier)
  VALUES (p_shop_id, auth.uid(), p_state, p_code_verifier)
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_mp_oauth_state(p_state text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _row public.mp_oauth_states%ROWTYPE;
BEGIN
  SELECT * INTO _row
  FROM public.mp_oauth_states
  WHERE state = p_state AND expires_at >= now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'invalid_state');
  END IF;

  DELETE FROM public.mp_oauth_states WHERE id = _row.id;

  RETURN json_build_object(
    'shop_id', _row.shop_id,
    'user_id', _row.user_id,
    'code_verifier', _row.code_verifier
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_panel_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_payment_panel_settings(boolean, text, text, int, boolean, boolean, boolean, boolean, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disconnect_mp_account() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_mp_oauth_tokens(uuid, uuid, bigint, text, text, int, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_mp_oauth_state(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_mp_oauth_state(text) TO service_role;
