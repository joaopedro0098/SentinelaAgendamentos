-- 1x com toggle ON: repassa taxa fixa de cartão (3,99% + R$ 0,39).
-- 2x+ mantém acréscimo editável por faixa sobre base + 3,99%.

CREATE OR REPLACE FUNCTION public.calculate_installment_checkout_centavos(
  p_base_centavos int,
  p_installment_count int,
  p_pass_fee_to_client boolean,
  p_max_count smallint,
  p_surcharge_rates jsonb
)
RETURNS json
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  _count int := GREATEST(coalesce(p_installment_count, 1), 1);
  _base int := GREATEST(coalesce(p_base_centavos, 0), 0);
  _stripe_percent_part int;
  _base_percentual int;
  _prof_percent numeric;
  _surcharge int;
  _fixed_fee int := 0;
  _total int;
  _key text;
BEGIN
  IF _base < 50 THEN
    RETURN json_build_object('error', 'invalid_base_amount');
  END IF;

  IF NOT coalesce(p_pass_fee_to_client, false) THEN
    RETURN json_build_object(
      'installment_count', _count,
      'valor_base_centavos', _base,
      'stripe_percent_centavos', 0,
      'installment_surcharge_centavos', 0,
      'installment_fixed_fee_centavos', 0,
      'total_centavos', _base
    );
  END IF;

  _stripe_percent_part := round(_base::numeric * 3.99 / 100.0)::int;
  _base_percentual := _base + _stripe_percent_part;
  _fixed_fee := 39;

  IF _count <= 1 THEN
    _total := _base_percentual + _fixed_fee;

    IF _total < 50 THEN
      _total := 50;
    END IF;

    RETURN json_build_object(
      'installment_count', 1,
      'valor_base_centavos', _base,
      'stripe_percent_centavos', _stripe_percent_part,
      'installment_surcharge_centavos', 0,
      'installment_fixed_fee_centavos', _fixed_fee,
      'total_centavos', _total
    );
  END IF;

  IF NOT public.installment_config_enabled(p_max_count, p_surcharge_rates) THEN
    RETURN json_build_object('error', 'installments_not_configured');
  END IF;

  IF _count > p_max_count THEN
    RETURN json_build_object('error', 'installment_count_exceeds_max');
  END IF;

  _key := _count::text;
  IF NOT (p_surcharge_rates ? _key) THEN
    RETURN json_build_object('error', 'installment_rate_missing');
  END IF;

  _prof_percent := public.clamp_installment_surcharge_percent((p_surcharge_rates ->> _key)::numeric);
  _surcharge := round(_base_percentual::numeric * _prof_percent / 100.0)::int;
  _total := _base_percentual + _surcharge + _fixed_fee;

  IF _total < 50 THEN
    _total := 50;
  END IF;

  RETURN json_build_object(
    'installment_count', _count,
    'valor_base_centavos', _base,
    'stripe_percent_centavos', _stripe_percent_part,
    'installment_surcharge_centavos', _surcharge,
    'installment_fixed_fee_centavos', _fixed_fee,
    'total_centavos', _total,
    'prof_surcharge_percent', _prof_percent
  );
END;
$$;

COMMENT ON FUNCTION public.calculate_installment_checkout_centavos(int, int, boolean, smallint, jsonb) IS
  'Total do checkout. Toggle off = base. Toggle on: 1x = base + 3,99% + R$0,39; 2x+ = base + 3,99% + acréscimo faixa + R$0,39.';
