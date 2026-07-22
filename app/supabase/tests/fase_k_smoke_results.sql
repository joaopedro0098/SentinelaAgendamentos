-- Fase K smoke: retorna linhas (sem RAISE NOTICE) para CI/log
BEGIN;
CREATE TEMP TABLE IF NOT EXISTS _fase_k_results (test int, name text, ok boolean, detail text);
TRUNCATE _fase_k_results;

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
  _n int; _new_id uuid; _deleted int; _rpc json;
BEGIN
  SELECT pd.whatsapp_digits INTO _doc_whatsapp FROM public.paciente_documentos pd WHERE pd.id = _doc_id;

  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  SELECT count(*) INTO _n FROM public.agendamentos a
  WHERE a.barbeiro_id = _grid_barbeiro AND a.status IN ('confirmado','aguardando_pagamento') AND a.data >= CURRENT_DATE;
  INSERT INTO _fase_k_results VALUES (1, 'anon SELECT grade', _n > 0, format('%s rows', _n));

  INSERT INTO public.agendamentos (barbearia_id, barbeiro_id, data, hora, cliente_nome, cliente_whatsapp, cliente_id, duracao_minutos, servicos_nomes, status, origem)
  VALUES (_barbearia, _barbeiro, CURRENT_DATE + 30, '23:59', 'Smoke K', '5511999887766', _cliente, 30, ARRAY['Smoke']::text[], 'confirmado', 'link_publico')
  RETURNING id INTO _new_id;
  INSERT INTO _fase_k_results VALUES (1, 'anon INSERT confirmado', _new_id IS NOT NULL, coalesce(_new_id::text, 'null'));

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _ct::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  INSERT INTO public.agendamentos (barbearia_id, barbeiro_id, data, hora, cliente_nome, cliente_whatsapp, cliente_id, duracao_minutos, servicos_nomes, status, origem, requires_client_confirmation)
  VALUES (_barbearia, _barbeiro, CURRENT_DATE + 31, '23:58', 'Smoke K Painel', '5511999887755', _cliente, 30, ARRAY['Smoke']::text[], 'confirmado', 'painel', true)
  RETURNING id INTO _new_id;
  INSERT INTO _fase_k_results VALUES (2, 'painel INSERT origem=painel', _new_id IS NOT NULL, coalesce(_new_id::text, 'null'));

  PERFORM set_config('request.jwt.claim.sub', _ca::text, true);
  SELECT count(*) INTO _n FROM public.clientes c WHERE c.titular_user_id = _ct AND c.archived_at IS NULL;
  INSERT INTO _fase_k_results VALUES (3, 'CA SELECT clientes CT', _n > 0, format('%s rows', _n));
  SELECT count(*) INTO _n FROM public.clientes c WHERE c.id = _other_cliente;
  INSERT INTO _fase_k_results VALUES (3, 'CA SELECT outro tenant', _n = 0, format('%s rows', _n));

  PERFORM set_config('request.jwt.claim.sub', _ct::text, true);
  _rpc := public.list_paciente_documentos(_doc_whatsapp);
  INSERT INTO _fase_k_results VALUES (4, 'RPC list_paciente_documentos',
    (_rpc->>'error') IS NULL OR ((_rpc->>'error') = 'not_found' AND NOT public.painel_paciente_documentos_visivel(_doc_whatsapp)),
    _rpc::text);

  PERFORM set_config('request.jwt.claim.sub', _ca::text, true);
  SELECT count(*) INTO _n FROM public.paciente_documentos pd WHERE pd.id = _doc_id;
  INSERT INTO _fase_k_results VALUES (4, 'SELECT direto doc titular (CA)', _n = 1, format('%s rows', _n));
  PERFORM set_config('request.jwt.claim.sub', _ct::text, true);
  SELECT count(*) INTO _n FROM public.paciente_documentos pd WHERE pd.titular_user_id = _other_titular;
  INSERT INTO _fase_k_results VALUES (4, 'SELECT direto outro titular', _n = 0, format('%s rows', _n));

  PERFORM set_config('request.jwt.claim.sub', _ca::text, true);
  DELETE FROM public.paciente_documentos WHERE id = _doc_id;
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  INSERT INTO _fase_k_results VALUES (5, 'DELETE paciente_documentos', _deleted = 0, format('%s rows deleted', _deleted));
  INSERT INTO _fase_k_results VALUES (5, 'storage delete_own policy gone',
    NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='paciente_documentos_delete_own'),
    'policy absent');
END $$;

SELECT test, name, ok, detail FROM _fase_k_results ORDER BY test, name;
ROLLBACK;
