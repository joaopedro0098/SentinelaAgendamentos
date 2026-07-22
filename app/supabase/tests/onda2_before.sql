-- Onda 2 test plan — ANTES (read-only on remote)

\set ON_ERROR_STOP on

SELECT 'SETUP' AS phase, aa.aggregated_user_id AS ca_user_id, aa.owner_user_id AS ct_user_id
FROM public.aggregated_accounts aa
WHERE aa.owner_user_id = 'b31a6a89-55a8-431b-b0c4-764071270390'::uuid
  AND aa.status = 'active'::public.aggregated_account_status
LIMIT 1;

SELECT 'BASELINE_AGENDAMENTOS' AS phase,
  count(DISTINCT public.cliente_whatsapp_digits(a.cliente_whatsapp)) AS distinct_whatsapps,
  count(*) FILTER (WHERE a.barbearia_id IS NULL) AS orfaos_total,
  count(*) FILTER (WHERE a.barbearia_id IS NULL AND a.archived_at IS NULL) AS orfaos_ativos,
  count(*) FILTER (WHERE a.archived_at IS NOT NULL) AS arquivados
FROM public.agendamentos a
WHERE a.titular_user_id = 'b31a6a89-55a8-431b-b0c4-764071270390'::uuid;

SELECT 'BASELINE_JOAO_PEDRO' AS phase, count(*) AS arquivado_count
FROM public.clientes c
WHERE c.id = '507fbdcb-318a-4111-908d-0220309dd0d7'::uuid
  AND c.archived_at IS NOT NULL;

-- Test A: list_pacientes_painel as CT
BEGIN;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claim.sub', 'b31a6a89-55a8-431b-b0c4-764071270390', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT 'TEST_A_CT' AS phase,
  (r->>'total_count')::int AS total_count,
  (SELECT count(*) FROM json_array_elements(r->'pacientes') p
   WHERE (p->>'whatsapp_digits') IN ('5511977687222', '11977687222')) AS felipe_present,
  (SELECT count(*) FROM json_array_elements(r->'pacientes') p
   WHERE (p->>'cliente_nome') ILIKE '%João Pedro%' OR (p->>'whatsapp_digits') LIKE '%0220309dd0d7%') AS joao_pedro_present,
  (SELECT count(*) FROM json_array_elements(r->'pacientes') p
   WHERE (p->>'can_rename_nome')::boolean = true) AS can_rename_true_count
FROM (
  SELECT public.list_pacientes_painel(NULL, NULL, 500, 0)::jsonb AS r
) x;

SELECT 'TEST_A_ORFAOS_IN_LIST' AS phase,
  count(*) AS orfaos_in_pacientes_list
FROM (
  SELECT jsonb_array_elements(r->'pacientes') AS p
  FROM (SELECT public.list_pacientes_painel(NULL, NULL, 500, 0)::jsonb AS r) x
) y
WHERE EXISTS (
  SELECT 1 FROM public.agendamentos a
  WHERE a.titular_user_id = 'b31a6a89-55a8-431b-b0c4-764071270390'::uuid
    AND a.archived_at IS NULL
    AND a.barbearia_id IS NULL
    AND public.cliente_whatsapp_digits(a.cliente_whatsapp) = (y.p->>'whatsapp_digits')
);

ROLLBACK;

-- Test B: get_agendamentos_painel CT vs CA (wide date range)
DO $$
DECLARE
  _ca uuid;
  _inicio date := (timezone('America/Sao_Paulo', now()) - interval '2 years')::date;
  _fim date := (timezone('America/Sao_Paulo', now()) + interval '1 year')::date;
  _ct_orfaos jsonb;
  _ca_orfaos jsonb;
BEGIN
  SELECT aa.aggregated_user_id INTO _ca
  FROM public.aggregated_accounts aa
  WHERE aa.owner_user_id = 'b31a6a89-55a8-431b-b0c4-764071270390'::uuid
    AND aa.status = 'active'::public.aggregated_account_status
  LIMIT 1;

  PERFORM set_config('request.jwt.claim.sub', 'b31a6a89-55a8-431b-b0c4-764071270390', false);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', false);
  PERFORM set_config('role', 'authenticated', false);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', item->>'id',
    'barbearia_id', item->>'barbearia_id',
    'can_manage', item->>'can_manage'
  )), '[]'::jsonb)
  INTO _ct_orfaos
  FROM jsonb_array_elements(
    (public.get_agendamentos_painel(_inicio, _fim)::jsonb)->'items'
  ) item
  WHERE item->>'barbearia_id' IS NULL;

  PERFORM set_config('request.jwt.claim.sub', _ca::text, false);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', item->>'id',
    'barbearia_id', item->>'barbearia_id',
    'can_manage', item->>'can_manage'
  )), '[]'::jsonb)
  INTO _ca_orfaos
  FROM jsonb_array_elements(
    (public.get_agendamentos_painel(_inicio, _fim)::jsonb)->'items'
  ) item
  WHERE item->>'barbearia_id' IS NULL;

  RAISE NOTICE 'TEST_B_CA_USER_ID=%', _ca;
  RAISE NOTICE 'TEST_B_CT_ORFAOS=%', _ct_orfaos;
  RAISE NOTICE 'TEST_B_CA_ORFAOS=%', _ca_orfaos;
  RAISE NOTICE 'TEST_B_CT_ALL_CAN_MANAGE=%',
    (SELECT bool_and((item->>'can_manage')::boolean)
     FROM jsonb_array_elements(_ct_orfaos) item);
  RAISE NOTICE 'TEST_B_CA_ANY_CAN_MANAGE=%',
    (SELECT bool_or((item->>'can_manage')::boolean)
     FROM jsonb_array_elements(_ca_orfaos) item);
END $$;

-- Test C: get_relatorio_agendamentos
DO $$
DECLARE
  _inicio date := (timezone('America/Sao_Paulo', now()) - interval '2 years')::date;
  _fim date := (timezone('America/Sao_Paulo', now()) + interval '1 year')::date;
  _baseline_total int;
  _baseline_faltas int;
  _baseline_cancel int;
  _rpc jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'b31a6a89-55a8-431b-b0c4-764071270390', false);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', false);
  PERFORM set_config('role', 'authenticated', false);

  SELECT
    count(*) FILTER (WHERE status = 'concluido'::public.agendamento_status),
    count(*) FILTER (WHERE status = 'nao_veio'::public.agendamento_status),
    count(*) FILTER (WHERE status = 'cancelado'::public.agendamento_status)
  INTO _baseline_total, _baseline_faltas, _baseline_cancel
  FROM public.agendamentos a
  WHERE a.titular_user_id = 'b31a6a89-55a8-431b-b0c4-764071270390'::uuid
    AND a.archived_at IS NULL
    AND a.data BETWEEN _inicio AND _fim;

  _rpc := public.get_relatorio_agendamentos(_inicio, _fim)::jsonb;

  RAISE NOTICE 'TEST_C_BASELINE total=% faltas=% cancel=%', _baseline_total, _baseline_faltas, _baseline_cancel;
  RAISE NOTICE 'TEST_C_RPC total=% faltas=% cancel=% por_barbeiro_len=%',
    _rpc->>'total', _rpc->>'total_faltas', _rpc->>'total_cancelamentos',
    jsonb_array_length(coalesce(_rpc->'por_barbeiro', '[]'::jsonb));
END $$;
