-- E2E produção: create_public_booking_payment_hold grava origem = paciente_logado
DO $$
DECLARE
  _result json;
  _ag_id uuid;
  _origem text;
  _status text;
  _verdict text;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _e2e_test1 (test text, rpc_ok text, rpc_error text, origem_gravada text, status_gravado text, result text);
  TRUNCATE _e2e_test1;

  _result := public.create_public_booking_payment_hold(
    '9289f540-c18b-4973-b36a-15dbb5bd4080'::uuid,
    '6b489184-7079-4e5b-8753-cdf0e0a5f79a'::uuid,
    (CURRENT_DATE + 93),
    '17:00'::time,
    'E2E Hotfix Origem',
    '5511988887777',
    '2a19b096-8155-4cef-8e39-088d2b396616'::uuid,
    30,
    ARRAY['Atendimento clínico'],
    'e2e cleanup'
  );

  _ag_id := (_result->>'agendamento_id')::uuid;

  PERFORM set_config('row_security', 'off', true);
  SELECT origem, status::text INTO _origem, _status
  FROM public.agendamentos WHERE id = _ag_id;

  IF (_result->>'error') IS NOT NULL THEN
    _verdict := 'FAIL: ' || (_result->>'error');
  ELSIF (_result->>'ok') = 'true' AND _origem = 'paciente_logado' THEN
    _verdict := 'PASS';
  ELSE
    _verdict := 'FAIL: ok=' || COALESCE(_result->>'ok', 'null') || ' origem=' || COALESCE(_origem, 'null');
  END IF;

  DELETE FROM public.agendamentos WHERE id = _ag_id;

  INSERT INTO _e2e_test1 VALUES (
    'test1_payment_hold',
    _result->>'ok',
    _result->>'error',
    _origem,
    _status,
    _verdict
  );
END $$;

SELECT * FROM _e2e_test1;
