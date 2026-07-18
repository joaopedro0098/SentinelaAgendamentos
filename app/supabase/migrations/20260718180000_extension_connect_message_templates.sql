-- Sentinela Connect: mensagens pré-definidas por usuário + nome da clínica para variáveis.

CREATE TABLE IF NOT EXISTS public.extension_connect_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL,
  body text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT extension_connect_message_templates_label_len
    CHECK (char_length(trim(label)) BETWEEN 1 AND 80),
  CONSTRAINT extension_connect_message_templates_body_len
    CHECK (char_length(trim(body)) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS idx_extension_connect_message_templates_user
  ON public.extension_connect_message_templates (user_id, sort_order, created_at DESC);

COMMENT ON TABLE public.extension_connect_message_templates IS
  'Mensagens pré-definidas da extensão Sentinela Connect (por usuário do token).';

ALTER TABLE public.extension_connect_message_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own connect message templates" ON public.extension_connect_message_templates;
CREATE POLICY "users read own connect message templates"
  ON public.extension_connect_message_templates FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "no direct write connect message templates" ON public.extension_connect_message_templates;
CREATE POLICY "no direct write connect message templates"
  ON public.extension_connect_message_templates FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.extension_connect_clinic_display_name(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (
      SELECT bs_owner.display_name
      FROM public.aggregated_accounts aa
      JOIN public.barbershops bs_owner ON bs_owner.owner_id = aa.owner_user_id
      WHERE aa.aggregated_user_id = p_user_id
        AND aa.status = 'active'::public.aggregated_account_status
      ORDER BY aa.activated_at DESC NULLS LAST, aa.invited_at DESC
      LIMIT 1
    ),
    (
      SELECT s.display_name
      FROM public.barbershops s
      WHERE s.owner_id = p_user_id
      LIMIT 1
    ),
    'Clínica'
  );
$$;

CREATE OR REPLACE FUNCTION public.extension_connect_list_message_templates(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _templates json;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN json_build_object('error', 'invalid_user');
  END IF;

  SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.sort_order ASC, t.created_at ASC), '[]'::json)
  INTO _templates
  FROM (
    SELECT id, label, body, sort_order, created_at, updated_at
    FROM public.extension_connect_message_templates
    WHERE user_id = p_user_id
  ) t;

  RETURN json_build_object(
    'templates', _templates,
    'clinic_display_name', public.extension_connect_clinic_display_name(p_user_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.extension_connect_upsert_message_template(
  p_user_id uuid,
  p_id uuid,
  p_label text,
  p_body text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _label text;
  _body text;
  _id uuid;
  _sort int;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN json_build_object('error', 'invalid_user');
  END IF;

  _label := trim(coalesce(p_label, ''));
  _body := trim(coalesce(p_body, ''));

  IF char_length(_label) = 0 OR char_length(_label) > 80 THEN
    RETURN json_build_object('error', 'invalid_label');
  END IF;
  IF char_length(_body) = 0 OR char_length(_body) > 2000 THEN
    RETURN json_build_object('error', 'invalid_body');
  END IF;

  IF p_id IS NOT NULL THEN
    UPDATE public.extension_connect_message_templates t
    SET label = _label, body = _body, updated_at = now()
    WHERE t.id = p_id AND t.user_id = p_user_id
    RETURNING t.id INTO _id;

    IF _id IS NULL THEN
      RETURN json_build_object('error', 'not_found');
    END IF;
  ELSE
    SELECT coalesce(max(sort_order), -1) + 1
    INTO _sort
    FROM public.extension_connect_message_templates
    WHERE user_id = p_user_id;

    INSERT INTO public.extension_connect_message_templates (user_id, label, body, sort_order)
    VALUES (p_user_id, _label, _body, coalesce(_sort, 0))
    RETURNING id INTO _id;
  END IF;

  RETURN json_build_object(
    'ok', true,
    'template', (
      SELECT row_to_json(x)
      FROM (
        SELECT id, label, body, sort_order, created_at, updated_at
        FROM public.extension_connect_message_templates
        WHERE id = _id
      ) x
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.extension_connect_delete_message_template(
  p_user_id uuid,
  p_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_id IS NULL THEN
    RETURN json_build_object('error', 'invalid_request');
  END IF;

  DELETE FROM public.extension_connect_message_templates
  WHERE id = p_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.extension_connect_clinic_display_name(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.extension_connect_list_message_templates(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.extension_connect_upsert_message_template(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.extension_connect_delete_message_template(uuid, uuid) TO service_role;

-- Inclui clinic_display_name no lookup do painel.
CREATE OR REPLACE FUNCTION public.extension_connect_client_lookup(
  p_user_id uuid,
  p_phone text,
  p_display_name text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _digits text;
  _barbearia_ids uuid[];
  _familia_ids uuid[];
  _nome text;
  _avatar text;
  _clinica text;
  _history json;
  _history_total int;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN json_build_object('error', 'invalid_user');
  END IF;

  _digits := public.cliente_whatsapp_digits(p_phone);
  IF length(_digits) < 10 OR length(_digits) > 13 THEN
    RETURN json_build_object('error', 'invalid_phone', 'phone_digits', _digits);
  END IF;

  _clinica := public.extension_connect_clinic_display_name(p_user_id);
  _barbearia_ids := public.painel_barbearia_ids_pacientes_visiveis_for_user(p_user_id);
  _familia_ids := public.painel_barbearia_ids_familia_conta_for_user(p_user_id);

  IF coalesce(array_length(_barbearia_ids, 1), 0) = 0 THEN
    RETURN json_build_object(
      'phone_digits', _digits,
      'clinic_display_name', _clinica,
      'patient', json_build_object(
        'nome', coalesce(nullif(trim(p_display_name), ''), 'Paciente'),
        'avatar_url', NULL,
        'whatsapp_digits', _digits
      ),
      'history', '[]'::json,
      'history_total', 0,
      'history_has_more', false
    );
  END IF;

  SELECT coalesce(
    (
      SELECT c.nome
      FROM public.clientes c
      WHERE c.barbearia_id = ANY(_familia_ids)
        AND public.whatsapp_match_digits(c.whatsapp, _digits)
      ORDER BY c.updated_at DESC
      LIMIT 1
    ),
    (
      SELECT a.cliente_nome
      FROM public.agendamentos a
      WHERE public.painel_agendamento_visivel_pacientes(a.barbearia_id, a.barbeiro_id, _barbearia_ids)
        AND public.whatsapp_match_digits(a.cliente_whatsapp, _digits)
      ORDER BY a.data DESC, a.hora DESC
      LIMIT 1
    ),
    nullif(trim(p_display_name), ''),
    'Paciente'
  )
  INTO _nome;

  SELECT c.avatar_url
  INTO _avatar
  FROM public.clientes c
  WHERE c.barbearia_id = ANY(_familia_ids)
    AND public.whatsapp_match_digits(c.whatsapp, _digits)
  ORDER BY (c.avatar_url IS NOT NULL AND trim(c.avatar_url) <> '') DESC, c.updated_at DESC
  LIMIT 1;

  IF _avatar IS NOT NULL AND trim(_avatar) = '' THEN
    _avatar := NULL;
  END IF;

  SELECT coalesce(json_agg(row_to_json(x) ORDER BY x.data DESC, x.hora DESC), '[]'::json)
  INTO _history
  FROM (
    SELECT
      a.id AS agendamento_id,
      a.data,
      to_char(a.hora, 'HH24:MI') AS hora,
      a.duracao_minutos,
      coalesce(bb.slot_minutos, 30) AS slot_minutos,
      bb.nome AS barbeiro_nome,
      to_jsonb(coalesce(a.servicos_nomes, ARRAY[]::text[])) AS servicos_nomes,
      CASE
        WHEN public.extension_connect_pode_ler_conteudo_anotacao(a.id, p_user_id) THEN an.conteudo
        ELSE NULL
      END AS anotacao_conteudo
    FROM public.agendamentos a
    JOIN public.barbeiros bb ON bb.id = a.barbeiro_id
    LEFT JOIN public.agendamento_anotacoes an ON an.agendamento_id = a.id
    WHERE public.painel_agendamento_visivel_pacientes(a.barbearia_id, a.barbeiro_id, _barbearia_ids)
      AND public.whatsapp_match_digits(a.cliente_whatsapp, _digits)
      AND (
        a.status = 'concluido'::public.agendamento_status
        OR an.id IS NOT NULL
      )
  ) x;

  _history_total := coalesce(json_array_length(_history), 0);

  RETURN json_build_object(
    'phone_digits', _digits,
    'clinic_display_name', _clinica,
    'patient', json_build_object(
      'nome', _nome,
      'avatar_url', _avatar,
      'whatsapp_digits', _digits
    ),
    'history', _history,
    'history_total', _history_total,
    'history_has_more', _history_total > 4
  );
END;
$$;
