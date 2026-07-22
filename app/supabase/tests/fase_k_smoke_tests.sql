-- Fase K smoke tests (RLS: SET LOCAL ROLE + JWT claims)
BEGIN;
DO $$
DECLARE
  _ct uuid := 'b31a6a89-55a8-431b-b0c4-764071270390';
  _ca uuid := 'eddba38d-fb2a-461c-997a-de91371cba65';
  _barbearia uuid := '8e2168ac-040c-40e7-b107-9f55c3d865d6';
  _barbeiro uuid := 'eea6eec8-aa44-432b-ad88-464521de4c79';
  _grid_barbeiro uuid := '6b489184-7079-4e5b-8753-cdf0e0a5f79a';
  _cliente uuid := '15abeda7-15c3-4f0c-a893-7c63d1ac6c07';
  _other_cliente uuid := '2a19b096-8155-4cef-8e39-088d2b396616';
  _other_titular uuid := '4d2e5778-7c69-410c-b4a0-2a44ac1e0c0a';
  _doc_id uuid := 'bde1bf1f-1d1b-447b-884c-5b12df2c57c2';
  _doc_whatsapp text;
  _n int;
  _new_id uuid;
  _deleted int;
  _rpc json;
BEGIN
  SELECT pd.whatsapp_digits INTO _doc_whatsapp
  FROM public.paciente_documentos pd
  WHERE pd.id = _doc_id;

  IF _doc_whatsapp IS NULL THEN
    RAISE EXCEPTION 'SETUP FAIL: doc fixture % inexistente', _doc_id;
  END IF;

  RAISE NOTICE '=== TEST 1: anon SELECT grade + INSERT confirmado ===';
  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);

  SELECT count(*) INTO _n
  FROM public.agendamentos a
  WHERE a.barbeiro_id = _grid_barbeiro
    AND a.status IN ('confirmado', 'aguardando_pagamento')
    AND a.data >= CURRENT_DATE;

  IF _n <= 0 THEN
    RAISE EXCEPTION 'TEST1 FAIL: anon SELECT grade retornou 0 linhas';
  END IF;
  RAISE NOTICE 'TEST1 SELECT grade: OK (% linhas visíveis)', _n;

  INSERT INTO public.agendamentos (
    barbearia_id, barbeiro_id, data, hora,
    cliente_nome, cliente_whatsapp, cliente_id,
    duracao_minutos, servicos_nomes, status, origem
  )
  VALUES (
    _barbearia, _barbeiro, CURRENT_DATE + 30, '23:59',
    'Smoke K Anon', '5511999887766', _cliente,
    30, ARRAY['Smoke']::text[], 'confirmado'::public.agendamento_status, 'link_publico'
  )
  RETURNING id INTO _new_id;

  IF _new_id IS NULL THEN
    RAISE EXCEPTION 'TEST1 FAIL: anon INSERT confirmado não retornou id';
  END IF;
  RAISE NOTICE 'TEST1 INSERT confirmado: OK (id=%)', _new_id;

  RAISE NOTICE '=== TEST 2: authenticated painel INSERT origem=painel ===';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _ct::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  INSERT INTO public.agendamentos (
    barbearia_id, barbeiro_id, data, hora,
    cliente_nome, cliente_whatsapp, cliente_id,
    duracao_minutos, servicos_nomes, status, origem, requires_client_confirmation
  )
  VALUES (
    _barbearia, _barbeiro, CURRENT_DATE + 31, '23:58',
    'Smoke K Painel', '5511999887755', _cliente,
    30, ARRAY['Smoke']::text[], 'confirmado'::public.agendamento_status, 'painel', true
  )
  RETURNING id INTO _new_id;

  IF _new_id IS NULL THEN
    RAISE EXCEPTION 'TEST2 FAIL: painel INSERT não retornou id';
  END IF;
  RAISE NOTICE 'TEST2 INSERT painel: OK (id=%)', _new_id;

  RAISE NOTICE '=== TEST 3: CA SELECT clientes titular OK; outro tenant negado ===';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _ca::text, true);

  SELECT count(*) INTO _n
  FROM public.clientes c
  WHERE c.titular_user_id = _ct AND c.archived_at IS NULL;

  IF _n <= 0 THEN
    RAISE EXCEPTION 'TEST3 FAIL: CA não vê clientes do titular CT (count=0)';
  END IF;
  RAISE NOTICE 'TEST3 CA vê clientes CT: OK (% linhas)', _n;

  SELECT count(*) INTO _n
  FROM public.clientes c
  WHERE c.id = _other_cliente;

  IF _n <> 0 THEN
    RAISE EXCEPTION 'TEST3 FAIL: CA conseguiu ler cliente de outro tenant (count=%)', _n;
  END IF;
  RAISE NOTICE 'TEST3 outro tenant negado: OK (0 linhas via RLS)';

  RAISE NOTICE '=== TEST 4: RPC documentos + SELECT direto titular ===';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _ct::text, true);

  _rpc := public.list_paciente_documentos(_doc_whatsapp);
  IF (_rpc->>'error') IN ('not_authenticated', 'invalid_whatsapp') THEN
    RAISE EXCEPTION 'TEST4 FAIL: list_paciente_documentos (CT) error=%', _rpc;
  END IF;
  IF (_rpc->>'error') = 'not_found' THEN
    IF public.painel_paciente_documentos_visivel(_doc_whatsapp) THEN
      RAISE EXCEPTION 'TEST4 FAIL: RPC not_found mas painel_paciente_documentos_visivel=true';
    END IF;
    RAISE NOTICE 'TEST4 RPC list_paciente_documentos (CT): OK (not_found — sem agendamento qualificador; gate RPC intacto)';
  ELSIF (_rpc->'documentos') IS NOT NULL THEN
    RAISE NOTICE 'TEST4 RPC list_paciente_documentos (CT): OK (documentos=%)', json_array_length(_rpc->'documentos');
  ELSE
    RAISE EXCEPTION 'TEST4 FAIL: resposta RPC inesperada %', _rpc;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', _ca::text, true);
  SELECT count(*) INTO _n FROM public.paciente_documentos pd WHERE pd.id = _doc_id;
  IF _n <> 1 THEN
    RAISE EXCEPTION 'TEST4 FAIL: CA SELECT direto doc titular esperado 1, got %', _n;
  END IF;
  RAISE NOTICE 'TEST4 SELECT direto doc titular (CA): OK';

  PERFORM set_config('request.jwt.claim.sub', _ct::text, true);
  SELECT count(*) INTO _n
  FROM public.paciente_documentos pd
  WHERE pd.titular_user_id = _other_titular;
  IF _n <> 0 THEN
    RAISE EXCEPTION 'TEST4 FAIL: CT viu documentos de outro titular (count=%)', _n;
  END IF;
  RAISE NOTICE 'TEST4 SELECT direto outro titular negado: OK';

  RAISE NOTICE '=== TEST 5: DELETE direto paciente_documentos + storage.objects ===';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _ca::text, true);

  DELETE FROM public.paciente_documentos WHERE id = _doc_id;
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  IF _deleted <> 0 THEN
    RAISE EXCEPTION 'TEST5 FAIL: DELETE paciente_documentos afetou % linhas (esperado 0)', _deleted;
  END IF;
  RAISE NOTICE 'TEST5 DELETE paciente_documentos bloqueado: OK (0 rows)';

  -- storage.objects: Supabase bloqueia DELETE SQL direto (protect_delete).
  -- Validação RLS storage = policy delete_own removida (checada na migration).
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'paciente_documentos_delete_own'
  ) THEN
    RAISE EXCEPTION 'TEST5 FAIL: policy paciente_documentos_delete_own ainda existe';
  END IF;
  RAISE NOTICE 'TEST5 storage DELETE policy ausente: OK';

  RAISE NOTICE '=== FASE K SMOKE: ALL 5 PASSED ===';
END $$;
ROLLBACK;
