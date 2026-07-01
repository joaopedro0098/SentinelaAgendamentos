-- Fix: COALESCE json vs jsonb ao ler installment.surcharge_rates de settings JSON.

CREATE OR REPLACE FUNCTION public.calculate_installment_checkout_for_barbearia(
  p_barbearia_id uuid,
  p_base_centavos int,
  p_installment_count int
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _settings json;
  _config_shop_id uuid;
  _surcharge_rates jsonb;
BEGIN
  _settings := public.get_effective_appointment_payment_settings(p_barbearia_id);
  IF (_settings->>'error') IS NOT NULL THEN
    RETURN _settings;
  END IF;

  _surcharge_rates := coalesce(
    (_settings->'installment'->'surcharge_rates')::jsonb,
    '{}'::jsonb
  );

  RETURN public.calculate_installment_checkout_centavos(
    p_base_centavos,
    p_installment_count,
    coalesce((_settings->'installment'->>'pass_fee_to_client')::boolean, false),
    (_settings->'installment'->>'max_count')::smallint,
    _surcharge_rates
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_agendamento_installment_checkout(
  p_agendamento_id uuid,
  p_confirmation_token uuid,
  p_installment_count int
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row record;
  _calc json;
  _settings json;
  _base int;
  _surcharge_rates jsonb;
BEGIN
  SELECT *
  INTO _row
  FROM public.agendamentos a
  WHERE a.id = p_agendamento_id
    AND a.confirmation_token = p_confirmation_token
    AND a.status = 'aguardando_pagamento'::public.agendamento_status
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  IF _row.payment_expires_at IS NOT NULL AND _row.payment_expires_at < now() THEN
    RETURN json_build_object('error', 'expired');
  END IF;

  _base := coalesce(_row.valor_base_centavos, _row.valor_pago_centavos);
  _settings := public.get_effective_appointment_payment_settings(_row.barbearia_id);

  IF (_settings->>'error') IS NOT NULL THEN
    RETURN _settings;
  END IF;

  _surcharge_rates := coalesce(
    (_settings->'installment'->'surcharge_rates')::jsonb,
    '{}'::jsonb
  );

  _calc := public.calculate_installment_checkout_centavos(
    _base,
    p_installment_count,
    coalesce((_settings->'installment'->>'pass_fee_to_client')::boolean, false),
    (_settings->'installment'->>'max_count')::smallint,
    _surcharge_rates
  );

  IF (_calc->>'error') IS NOT NULL THEN
    RETURN _calc;
  END IF;

  UPDATE public.agendamentos
  SET
    valor_pago_centavos = (_calc->>'total_centavos')::int,
    installment_count = (_calc->>'installment_count')::smallint,
    installment_surcharge_centavos = (_calc->>'installment_surcharge_centavos')::int,
    installment_fixed_fee_centavos = (_calc->>'installment_fixed_fee_centavos')::int
  WHERE id = p_agendamento_id;

  RETURN (
    _calc::jsonb
    || jsonb_build_object('ok', true, 'agendamento_id', p_agendamento_id)
  )::json;
END;
$$;
