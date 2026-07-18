-- Sentinela Connect (Chrome Extension): tokens de API + lookup por telefone respeitando CT/CA.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.extension_connect_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  label text NOT NULL DEFAULT 'Chrome',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_extension_connect_tokens_user
  ON public.extension_connect_tokens (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_extension_connect_tokens_hash_active
  ON public.extension_connect_tokens (token_hash)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE public.extension_connect_tokens IS
  'Tokens sc_live_* para a extensão Sentinela Connect. Armazena apenas SHA-256; plain text só na criação.';

ALTER TABLE public.extension_connect_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own extension tokens" ON public.extension_connect_tokens;
CREATE POLICY "users read own extension tokens"
  ON public.extension_connect_tokens FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "no direct write extension tokens" ON public.extension_connect_tokens;
CREATE POLICY "no direct write extension tokens"
  ON public.extension_connect_tokens FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- Mesma regra de painel_barbearia_ids_visiveis(), parametrizada por user_id (sem auth.uid()).
CREATE OR REPLACE FUNCTION public.painel_barbearia_ids_visiveis_for_user(p_user_id uuid)
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
    WHERE s.owner_id = p_user_id

    UNION

    SELECT b.id
    FROM public.aggregated_accounts aa
    JOIN public.barbershops cs ON cs.owner_id = aa.aggregated_user_id
    JOIN public.barbearias b ON b.slug = cs.slug
    WHERE aa.owner_user_id = p_user_id
      AND aa.status = 'active'::public.aggregated_account_status
      AND aa.owner_can_view_appointments = true
      AND NOT EXISTS (
        SELECT 1
        FROM public.aggregated_accounts self
        WHERE self.aggregated_user_id = p_user_id
          AND self.status = 'active'::public.aggregated_account_status
      )
  ) v
  WHERE v.id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.painel_barbearia_ids_agendamentos_editaveis_for_user(p_user_id uuid)
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
    WHERE s.owner_id = p_user_id

    UNION

    SELECT b.id
    FROM public.aggregated_accounts aa
    JOIN public.barbershops cs ON cs.owner_id = aa.aggregated_user_id
    JOIN public.barbearias b ON b.slug = cs.slug
    WHERE aa.owner_user_id = p_user_id
      AND aa.status = 'active'::public.aggregated_account_status
      AND aa.owner_can_view_appointments = true
      AND aa.owner_can_edit_appointments = true
      AND NOT EXISTS (
        SELECT 1
        FROM public.aggregated_accounts self
        WHERE self.aggregated_user_id = p_user_id
          AND self.status = 'active'::public.aggregated_account_status
      )
  ) v
  WHERE v.id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.extension_connect_whatsapp_matches(p_a text, p_b text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  WITH x AS (
    SELECT public.cliente_whatsapp_digits(p_a) AS d
  ),
  y AS (
    SELECT public.cliente_whatsapp_digits(p_b) AS d
  )
  SELECT
    x.d = y.d
    OR ('55' || x.d) = y.d
    OR x.d = ('55' || y.d)
  FROM x, y
  WHERE length(x.d) >= 10 AND length(y.d) >= 10;
$$;

CREATE OR REPLACE FUNCTION public.extension_connect_client_lookup(
  p_user_id uuid,
  p_phone text
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _digits text;
  _visible uuid[];
  _editable uuid[];
  _matches json;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN json_build_object('found', false, 'error', 'invalid_user');
  END IF;

  _digits := public.cliente_whatsapp_digits(p_phone);
  IF length(_digits) < 10 THEN
    RETURN json_build_object('found', false, 'error', 'invalid_phone', 'matches', '[]'::json);
  END IF;

  _visible := public.painel_barbearia_ids_visiveis_for_user(p_user_id);
  _editable := public.painel_barbearia_ids_agendamentos_editaveis_for_user(p_user_id);

  IF coalesce(array_length(_visible, 1), 0) = 0 THEN
    RETURN json_build_object('found', false, 'matches', '[]'::json);
  END IF;

  SELECT coalesce(json_agg(row_to_json(m) ORDER BY m.barbearia_nome), '[]'::json)
  INTO _matches
  FROM (
    SELECT
      b.id AS barbearia_id,
      coalesce(nullif(trim(s.display_name), ''), 'Clínica') AS barbearia_nome,
      json_build_object(
        'id', (
          SELECT cl.id
          FROM public.clientes cl
          WHERE cl.barbearia_id = b.id
            AND public.extension_connect_whatsapp_matches(cl.whatsapp, _digits)
          LIMIT 1
        ),
        'nome', coalesce(
          (
            SELECT cl.nome
            FROM public.clientes cl
            WHERE cl.barbearia_id = b.id
              AND public.extension_connect_whatsapp_matches(cl.whatsapp, _digits)
            LIMIT 1
          ),
          (
            SELECT a.cliente_nome
            FROM public.agendamentos a
            WHERE a.barbearia_id = b.id
              AND public.extension_connect_whatsapp_matches(a.cliente_whatsapp, _digits)
            ORDER BY a.data DESC, a.hora DESC
            LIMIT 1
          ),
          'Paciente'
        ),
        'whatsapp', _digits
      ) AS client,
      (
        SELECT json_build_object(
          'id', a.id,
          'data', a.data,
          'hora', to_char(a.hora, 'HH24:MI'),
          'status', a.status::text,
          'profissional', coalesce(br.nome, 'Profissional')
        )
        FROM public.agendamentos a
        LEFT JOIN public.barbeiros br ON br.id = a.barbeiro_id
        WHERE a.barbearia_id = b.id
          AND public.extension_connect_whatsapp_matches(a.cliente_whatsapp, _digits)
          AND a.data >= (timezone('America/Sao_Paulo', now()))::date
          AND a.status IN (
            'confirmado'::public.agendamento_status,
            'aguardando_pagamento'::public.agendamento_status
          )
        ORDER BY a.data ASC, a.hora ASC
        LIMIT 1
      ) AS next_appointment,
      (
        SELECT coalesce(json_agg(json_build_object(
          'id', h.id,
          'data', h.data,
          'hora', to_char(h.hora, 'HH24:MI'),
          'status', h.status::text,
          'profissional', coalesce(hbr.nome, 'Profissional')
        ) ORDER BY h.data DESC, h.hora DESC), '[]'::json)
        FROM (
          SELECT a.id, a.data, a.hora, a.status, a.barbeiro_id
          FROM public.agendamentos a
          WHERE a.barbearia_id = b.id
            AND public.extension_connect_whatsapp_matches(a.cliente_whatsapp, _digits)
          ORDER BY a.data DESC, a.hora DESC
          LIMIT 3
        ) h
        LEFT JOIN public.barbeiros hbr ON hbr.id = h.barbeiro_id
      ) AS recent_appointments,
      (b.id = ANY(_editable)) AS can_manage_appointments
    FROM public.barbearias b
    JOIN public.barbershops s ON s.slug = b.slug
    WHERE b.id = ANY(_visible)
      AND EXISTS (
        SELECT 1
        FROM public.agendamentos a
        WHERE a.barbearia_id = b.id
          AND public.extension_connect_whatsapp_matches(a.cliente_whatsapp, _digits)
      )
  ) m;

  RETURN json_build_object(
    'found', _matches IS NOT NULL AND _matches::text <> '[]',
    'phone_digits', _digits,
    'matches', coalesce(_matches, '[]'::json)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_extension_connect_token(p_label text DEFAULT 'Chrome')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _uid uuid;
  _plain text;
  _hash text;
  _id uuid;
  _label text;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  _label := trim(coalesce(p_label, ''));
  IF length(_label) = 0 OR length(_label) > 80 THEN
    _label := 'Chrome';
  END IF;

  _plain := 'sc_live_' || encode(gen_random_bytes(32), 'hex');
  _hash := encode(digest(convert_to(_plain, 'UTF8'), 'sha256'), 'hex');

  INSERT INTO public.extension_connect_tokens (user_id, token_hash, label)
  VALUES (_uid, _hash, _label)
  RETURNING id INTO _id;

  RETURN json_build_object(
    'id', _id,
    'token', _plain,
    'label', _label,
    'created_at', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_extension_connect_tokens()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid;
  _rows json;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::json)
  INTO _rows
  FROM (
    SELECT id, label, created_at, last_used_at, revoked_at,
      (revoked_at IS NULL) AS active
    FROM public.extension_connect_tokens
    WHERE user_id = _uid
  ) t;

  RETURN json_build_object('tokens', _rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_extension_connect_token(p_token_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  UPDATE public.extension_connect_tokens
  SET revoked_at = now()
  WHERE id = p_token_id
    AND user_id = _uid
    AND revoked_at IS NULL;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_extension_connect_token(p_token_hash text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row record;
BEGIN
  IF p_token_hash IS NULL OR length(trim(p_token_hash)) = 0 THEN
    RETURN json_build_object('valid', false);
  END IF;

  SELECT t.id, t.user_id
  INTO _row
  FROM public.extension_connect_tokens t
  WHERE t.token_hash = trim(p_token_hash)
    AND t.revoked_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('valid', false);
  END IF;

  UPDATE public.extension_connect_tokens
  SET last_used_at = now()
  WHERE id = _row.id;

  RETURN json_build_object('valid', true, 'user_id', _row.user_id, 'token_id', _row.id);
END;
$$;

REVOKE ALL ON FUNCTION public.painel_barbearia_ids_visiveis_for_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.painel_barbearia_ids_agendamentos_editaveis_for_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.extension_connect_whatsapp_matches(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.extension_connect_client_lookup(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_extension_connect_token(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_extension_connect_token(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_extension_connect_tokens() TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_extension_connect_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.extension_connect_client_lookup(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_extension_connect_token(text) TO service_role;

COMMENT ON FUNCTION public.extension_connect_client_lookup(uuid, text) IS
  'Lookup Sentinela Connect: pacientes/agendamentos por WhatsApp no escopo CT/CA (painel_barbearia_ids_visiveis). Exige agendamento na barbearia.';
