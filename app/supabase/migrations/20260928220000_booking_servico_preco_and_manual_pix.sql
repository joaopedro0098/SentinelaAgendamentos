-- Preços dos serviços em get_booking_professionals + RPC/coluna chave Pix manual (se ainda não aplicados).

ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS manual_pix_key text;

COMMENT ON COLUMN public.barbershops.manual_pix_key IS
  'Chave Pix informada pelo profissional para cobrança manual (copiar e enviar ao paciente).';

CREATE OR REPLACE FUNCTION public.get_shop_manual_pix_key()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shop public.barbershops%ROWTYPE;
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

  RETURN json_build_object(
    'ok', true,
    'manual_pix_key', nullif(trim(_shop.manual_pix_key), '')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_shop_manual_pix_key(p_manual_pix_key text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shop public.barbershops%ROWTYPE;
  _normalized text;
  _is_ca boolean := false;
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

  IF _is_ca THEN
    IF EXISTS (
      SELECT 1
      FROM public.barbershops ts
      WHERE ts.id = public.titular_shop_id_for_shop(_shop.id)
        AND coalesce(ts.payments_centralized, true)
    ) THEN
      RETURN json_build_object('error', 'forbidden', 'message', 'Conta titular centralizou pagamentos.');
    END IF;
  END IF;

  _normalized := nullif(trim(p_manual_pix_key), '');

  IF _normalized IS NOT NULL AND length(_normalized) > 140 THEN
    RETURN json_build_object('error', 'invalid', 'message', 'Chave Pix muito longa.');
  END IF;

  UPDATE public.barbershops
  SET manual_pix_key = _normalized,
      updated_at = now()
  WHERE id = _shop.id;

  RETURN json_build_object('ok', true, 'manual_pix_key', _normalized);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shop_manual_pix_key() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_shop_manual_pix_key(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_payment_panel_settings()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shop public.barbershops%ROWTYPE;
  _titular_shop public.barbershops%ROWTYPE;
  _config_shop public.barbershops%ROWTYPE;
  _mp_shop public.barbershops%ROWTYPE;
  _is_ca boolean := false;
  _is_ct boolean := false;
  _centralized boolean := false;
  _mp_connected boolean := false;
  _mp_managed_by_titular boolean := false;
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

  _config_shop := _shop;
  _mp_shop := _shop;

  IF _is_ca THEN
    SELECT ts.* INTO _titular_shop
    FROM public.barbershops ts
    WHERE ts.id = public.titular_shop_id_for_shop(_shop.id);

    IF NOT public.shop_can_use_appointment_payments(_titular_shop) THEN
      RETURN json_build_object(
        'role', 'ca',
        'ca_readonly', true,
        'payments_centralized', coalesce(_titular_shop.payments_centralized, true),
        'readonly_message',
          'O titular possui plano Start. Para receber pagamentos, o titular precisa assinar o Pro.'
      );
    END IF;

    _centralized := coalesce(_titular_shop.payments_centralized, true);

    IF _centralized THEN
      RETURN json_build_object(
        'role', 'ca',
        'ca_readonly', true,
        'payments_centralized', true,
        'readonly_message', 'Conta titular centralizou pagamentos.'
      );
    END IF;
  END IF;

  _mp_connected := _mp_shop.mp_connect_status = 'connected'::public.mp_connect_status
    AND _mp_shop.mp_access_token IS NOT NULL;

  RETURN json_build_object(
    'role', CASE WHEN _is_ca THEN 'ca' WHEN _is_ct THEN 'ct' ELSE 'owner' END,
    'ca_readonly', false,
    'shop_id', _shop.id,
    'payments_centralized', CASE WHEN _is_ca THEN _centralized ELSE coalesce(_shop.payments_centralized, true) END,
    'can_edit_centralization', _is_ct OR (NOT _is_ca AND NOT _is_ct),
    'mp_managed_by_titular', _mp_managed_by_titular,
    'can_connect_mp', NOT _mp_managed_by_titular,
    'mp_connect_status', _mp_shop.mp_connect_status::text,
    'mp_user_id', _mp_shop.mp_user_id,
    'mp_live_mode', _mp_shop.mp_live_mode,
    'mp_connected', _mp_connected,
    'appointment_payment_mode', _config_shop.appointment_payment_mode::text,
    'appointment_deposit_type', _config_shop.appointment_deposit_type::text,
    'appointment_deposit_value', _config_shop.appointment_deposit_value,
    'payment_enable_card', _config_shop.payment_enable_card,
    'payment_enable_pix', _config_shop.payment_enable_pix,
    'payment_pass_fee_card', _config_shop.payment_pass_fee_card,
    'payment_pass_fee_pix', _config_shop.payment_pass_fee_pix,
    'payment_max_installments', _config_shop.payment_max_installments,
    'has_priced_services', public.shop_has_priced_active_services(_shop.id),
    'can_enable_payment', _mp_connected,
    'manual_pix_key', nullif(trim(_shop.manual_pix_key), '')
  );
END;
$$;

-- get_booking_professionals: incluir preco_centavos nos serviços (painel + link público).

DROP FUNCTION IF EXISTS public.get_booking_professionals(text, date, date, boolean, boolean, boolean);

CREATE OR REPLACE FUNCTION public.get_booking_professionals(
  p_slug text,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_hub_only boolean DEFAULT false,
  p_editable_cas_only boolean DEFAULT false,
  p_painel_visiveis boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hub_slug text;
  _shop record;
  _is_ca boolean;
  _ca_slug text;
  _barbearia_ids uuid[];
  _result jsonb;
BEGIN
  _hub_slug := trim(p_slug);
  IF _hub_slug = '' THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT * INTO _shop
  FROM public.barbershops
  WHERE slug = _hub_slug
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN '[]'::jsonb;
  END IF;

  _is_ca := EXISTS (
    SELECT 1
    FROM public.aggregated_accounts aa
    WHERE aa.aggregated_user_id = _shop.owner_id
      AND aa.status = 'active'::public.aggregated_account_status
  );

  PERFORM public.ensure_agenda_from_barbershop_slug(_hub_slug);

  IF NOT _is_ca AND NOT COALESCE(p_hub_only, false) THEN
    FOR _ca_slug IN
      SELECT cs.slug
      FROM public.aggregated_accounts aa
      JOIN public.barbershops cs ON cs.owner_id = aa.aggregated_user_id
      WHERE aa.owner_user_id = _shop.owner_id
        AND aa.status = 'active'::public.aggregated_account_status
        AND (
          (
            NOT COALESCE(p_editable_cas_only, false)
            AND NOT COALESCE(p_painel_visiveis, false)
          )
          OR (
            COALESCE(p_editable_cas_only, false)
            AND aa.owner_can_view_appointments = true
            AND aa.owner_can_edit_appointments = true
          )
          OR (
            COALESCE(p_painel_visiveis, false)
            AND aa.owner_can_view_appointments = true
          )
        )
    LOOP
      PERFORM public.ensure_agenda_from_barbershop_slug(_ca_slug);
    END LOOP;
  END IF;

  IF COALESCE(p_hub_only, false) AND NOT _is_ca THEN
    SELECT coalesce(array_agg(b.id), ARRAY[]::uuid[])
    INTO _barbearia_ids
    FROM public.barbearias b
    WHERE b.slug = _hub_slug
      AND b.ativa = true;
  ELSIF COALESCE(p_editable_cas_only, false) AND NOT _is_ca THEN
    SELECT coalesce(array_agg(DISTINCT v.id), ARRAY[]::uuid[])
    INTO _barbearia_ids
    FROM (
      SELECT b.id
      FROM public.barbearias b
      WHERE b.slug = _hub_slug
        AND b.ativa = true

      UNION

      SELECT b.id
      FROM public.aggregated_accounts aa
      JOIN public.barbershops cs ON cs.owner_id = aa.aggregated_user_id
      JOIN public.barbearias b ON b.slug = cs.slug AND b.ativa = true
      WHERE aa.owner_user_id = _shop.owner_id
        AND aa.status = 'active'::public.aggregated_account_status
        AND aa.owner_can_view_appointments = true
        AND aa.owner_can_edit_appointments = true
    ) v
    WHERE v.id IS NOT NULL;
  ELSIF COALESCE(p_painel_visiveis, false) AND NOT _is_ca THEN
    SELECT coalesce(array_agg(DISTINCT v.id), ARRAY[]::uuid[])
    INTO _barbearia_ids
    FROM (
      SELECT b.id
      FROM public.barbearias b
      WHERE b.slug = _hub_slug
        AND b.ativa = true

      UNION

      SELECT b.id
      FROM public.aggregated_accounts aa
      JOIN public.barbershops cs ON cs.owner_id = aa.aggregated_user_id
      JOIN public.barbearias b ON b.slug = cs.slug AND b.ativa = true
      WHERE aa.owner_user_id = _shop.owner_id
        AND aa.status = 'active'::public.aggregated_account_status
        AND aa.owner_can_view_appointments = true
    ) v
    WHERE v.id IS NOT NULL;
  ELSE
    _barbearia_ids := public.client_hub_barbearia_ids_for_slug(_hub_slug);
  END IF;

  IF _barbearia_ids IS NULL OR cardinality(_barbearia_ids) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(row ORDER BY source_order, nome), '[]'::jsonb)
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
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'dia_semana', d.dia_semana,
          'hora_inicio', d.hora_inicio,
          'hora_fim', d.hora_fim
        ) ORDER BY d.dia_semana, d.hora_inicio), '[]'::jsonb)
        FROM public.disponibilidades d
        WHERE d.barbeiro_id = br.id
      ) AS disponibilidades,
      (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'data', bl.data,
          'hora_inicio', bl.hora_inicio,
          'hora_fim', bl.hora_fim
        ) ORDER BY bl.data), '[]'::jsonb)
        FROM public.bloqueios bl
        WHERE bl.barbeiro_id = br.id
          AND (p_from IS NULL OR bl.data >= p_from)
          AND (p_to IS NULL OR bl.data <= p_to)
      ) AS bloqueios,
      (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', bs.id,
          'nome', bs.nome,
          'duracao_minutos', bs.duracao_minutos,
          'preco_centavos', COALESCE(bs.preco_centavos, 0)
        ) ORDER BY bs.nome), '[]'::jsonb)
        FROM public.barbeiro_services bs
        WHERE bs.barbeiro_id = br.id
          AND bs.ativo = true
      ) AS servicos
    FROM public.barbeiros br
    JOIN public.barbearias bb ON bb.id = br.barbearia_id
    WHERE br.barbearia_id = ANY(_barbearia_ids)
      AND br.ativo = true
  ) row;

  RETURN COALESCE(_result, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_booking_professionals(text, date, date, boolean, boolean, boolean) IS
  'Profissionais para agendamento. p_hub_only=hub; p_editable_cas_only=hub+CAs editáveis; p_painel_visiveis=hub+CAs visíveis no painel; ambos false=link público.';

GRANT EXECUTE ON FUNCTION public.get_booking_professionals(text, date, date, boolean, boolean, boolean) TO anon, authenticated;

