-- Fase I smoke tests — run: npx supabase db query --linked -f supabase/tests/fase_i_smoke.sql

DO $$
DECLARE
  _owner uuid := 'eddba38d-fb2a-461c-997a-de91371cba65';
  _titular uuid := 'b31a6a89-55a8-431b-b0c4-764071270390';
  _barbearia uuid := 'd4c60f02-162e-4417-9a13-739ba6439f00';
  _ag_concluido uuid := '0b64c066-0e87-483a-9540-836d150a9797';
  _rpc json;
  _hold_id uuid;
  _doc_id uuid;
  _doc_path text := _titular::text || '/5511999990001/smoke-fase-i-' || gen_random_uuid()::text || '.txt';
  _barbeiro uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  RAISE NOTICE '=== TEST 1: archive concluido + cascata anotacao ===';
  _rpc := public.excluir_agendamento_painel(_ag_concluido);
  RAISE NOTICE 'test1_rpc=%', _rpc;

  IF (_rpc->>'ok')::boolean IS NOT TRUE OR (_rpc->>'archived')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST 1 FAIL: rpc=%', _rpc;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.id = _ag_concluido AND a.archived_at IS NOT NULL AND a.archived_by = _owner
  ) THEN
    RAISE EXCEPTION 'TEST 1 FAIL: agendamento not archived';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.agendamento_anotacoes an
    WHERE an.agendamento_id = _ag_concluido AND an.archived_at IS NOT NULL AND an.archived_by = _owner
  ) THEN
    RAISE EXCEPTION 'TEST 1 FAIL: anotacao not archived in cascade';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clinical_audit_log cal
    WHERE cal.table_name = 'agendamentos' AND cal.record_id = _ag_concluido AND cal.action = 'archive'
  ) THEN
    RAISE EXCEPTION 'TEST 1 FAIL: missing agendamento audit row';
  END IF;

  RAISE NOTICE 'TEST 1 PASS';

  RAISE NOTICE '=== TEST 2: hold aguardando_pagamento DELETE fisico ===';
  SELECT br.id INTO _barbeiro
  FROM public.barbeiros br
  WHERE br.barbearia_id = _barbearia AND br.ativo = true
  LIMIT 1;

  INSERT INTO public.agendamentos (
    barbearia_id, barbeiro_id, data, hora,
    cliente_nome, cliente_whatsapp, duracao_minutos, servicos_nomes,
    status, origem, titular_user_id, payment_expires_at
  )
  VALUES (
    _barbearia, _barbeiro, '2099-01-15'::date, '09:00'::time,
    'Smoke Hold Fase I', '5511999990001', 30, ARRAY['Teste']::text[],
    'aguardando_pagamento'::public.agendamento_status, 'link_publico', _titular,
    now() + interval '15 minutes'
  )
  RETURNING id INTO _hold_id;

  _rpc := public.excluir_agendamento_painel(_hold_id);
  RAISE NOTICE 'test2_rpc=% hold_id=%', _rpc, _hold_id;

  IF (_rpc->>'ok')::boolean IS NOT TRUE OR (_rpc->>'deleted')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST 2 FAIL: rpc=%', _rpc;
  END IF;

  IF EXISTS (SELECT 1 FROM public.agendamentos a WHERE a.id = _hold_id) THEN
    RAISE EXCEPTION 'TEST 2 FAIL: hold row still exists (expected physical delete)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.clinical_audit_log cal WHERE cal.record_id = _hold_id
  ) THEN
    RAISE EXCEPTION 'TEST 2 FAIL: unexpected clinical_audit_log for hold delete';
  END IF;

  RAISE NOTICE 'TEST 2 PASS';

  RAISE NOTICE '=== TEST 3: archive documento metadado ===';
  INSERT INTO public.paciente_documentos (
    barbearia_id, whatsapp_digits, file_name, mime_type, size_bytes,
    storage_path, uploaded_by, titular_user_id
  )
  VALUES (
    _barbearia, '5511999990001', 'smoke-fase-i.txt', 'text/plain', 12,
    _doc_path, _owner, _titular
  )
  RETURNING id INTO _doc_id;

  _rpc := public.delete_paciente_documento_painel(_doc_id);
  RAISE NOTICE 'test3_rpc=% doc_id=% storage_path=%', _rpc, _doc_id, _doc_path;

  IF (_rpc->>'ok')::boolean IS NOT TRUE OR (_rpc->>'archived')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST 3 FAIL: rpc=%', _rpc;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.paciente_documentos pd
    WHERE pd.id = _doc_id AND pd.archived_at IS NOT NULL AND pd.archived_by = _owner
  ) THEN
    RAISE EXCEPTION 'TEST 3 FAIL: documento metadado not archived';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clinical_audit_log cal
    WHERE cal.record_id = _doc_id AND cal.action = 'archive'
  ) THEN
    RAISE EXCEPTION 'TEST 3 FAIL: missing documento audit row';
  END IF;

  RAISE NOTICE 'TEST 3 PASS (storage blob not verified in SQL — path=%)', _doc_path;
END;
$$;

-- Resumo pós-smoke (test 1 permanece arquivado; test 2 removido; test 3 arquivado)
SELECT json_build_object(
  'test1_agendamento', (
    SELECT json_build_object('id', a.id, 'archived_at', a.archived_at, 'archived_by', a.archived_by)
    FROM public.agendamentos a WHERE a.id = '0b64c066-0e87-483a-9540-836d150a9797'
  ),
  'test1_anotacao', (
    SELECT json_build_object('id', an.id, 'archived_at', an.archived_at)
    FROM public.agendamento_anotacoes an
    WHERE an.agendamento_id = '0b64c066-0e87-483a-9540-836d150a9797'
  ),
  'test3_archived_docs', (
    SELECT count(*) FROM public.paciente_documentos pd
    WHERE pd.file_name = 'smoke-fase-i.txt' AND pd.archived_at IS NOT NULL
  )
) AS smoke_summary;
