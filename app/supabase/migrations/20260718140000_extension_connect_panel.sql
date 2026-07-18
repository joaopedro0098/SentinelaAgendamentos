-- Connect: lookup alinhado à aba Pacientes (histórico + avatar), mesmo sem agendamento prévio.

CREATE OR REPLACE FUNCTION public.painel_barbearia_ids_pacientes_visiveis_for_user(p_user_id uuid)
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
      AND NOT EXISTS (
        SELECT 1
        FROM public.aggregated_accounts self
        WHERE self.aggregated_user_id = p_user_id
          AND self.status = 'active'::public.aggregated_account_status
      )
  ) v
  WHERE v.id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.painel_barbearia_ids_familia_conta_for_user(p_user_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT b.id), ARRAY[]::uuid[])
  FROM public.barbearias b
  JOIN public.barbershops s ON s.slug = b.slug
  WHERE p_user_id IS NOT NULL
    AND (
      s.owner_id = p_user_id
      OR s.owner_id IN (
        SELECT aa.aggregated_user_id
        FROM public.aggregated_accounts aa
        WHERE aa.owner_user_id = p_user_id
          AND aa.status = 'active'::public.aggregated_account_status
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.extension_connect_pode_ler_conteudo_anotacao(
  p_agendamento_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agendamentos a
    JOIN public.barbearias b ON b.id = a.barbearia_id
    JOIN public.barbershops s ON s.slug = b.slug
    WHERE a.id = p_agendamento_id
      AND s.owner_id = p_user_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.agendamentos a
    JOIN public.barbearias ag_bb ON ag_bb.id = a.barbearia_id
    JOIN public.barbershops ag_shop ON ag_shop.slug = ag_bb.slug
    JOIN public.aggregated_accounts aa
      ON aa.aggregated_user_id = ag_shop.owner_id
     AND aa.status = 'active'::public.aggregated_account_status
    WHERE a.id = p_agendamento_id
      AND aa.owner_user_id = p_user_id
      AND aa.owner_can_view_annotations = true
      AND ag_shop.owner_id IS DISTINCT FROM p_user_id
  );
$$;

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

  _barbearia_ids := public.painel_barbearia_ids_pacientes_visiveis_for_user(p_user_id);
  _familia_ids := public.painel_barbearia_ids_familia_conta_for_user(p_user_id);

  IF coalesce(array_length(_barbearia_ids, 1), 0) = 0 THEN
    RETURN json_build_object(
      'phone_digits', _digits,
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
    AND c.avatar_url IS NOT NULL
    AND trim(c.avatar_url) <> ''
  ORDER BY c.updated_at DESC
  LIMIT 1;

  SELECT coalesce(json_agg(row_to_json(x) ORDER BY x.data DESC, x.hora DESC), '[]'::json)
  INTO _history
  FROM (
    SELECT
      a.id AS agendamento_id,
      a.data,
      to_char(a.hora, 'HH24:MI') AS hora,
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
    'patient', json_build_object(
      'nome', _nome,
      'avatar_url', _avatar,
      'whatsapp_digits', _digits
    ),
    'history', _history,
    'history_total', _history_total,
    'history_has_more', _history_total > 5
  );
END;
$$;

COMMENT ON FUNCTION public.extension_connect_client_lookup(uuid, text, text) IS
  'Painel Connect: paciente + histórico (mesma regra da aba Pacientes). Retorna shell mesmo sem histórico.';

GRANT EXECUTE ON FUNCTION public.painel_barbearia_ids_pacientes_visiveis_for_user(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.painel_barbearia_ids_familia_conta_for_user(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.extension_connect_pode_ler_conteudo_anotacao(uuid, uuid) TO service_role;
