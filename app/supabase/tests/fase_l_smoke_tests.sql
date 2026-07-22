-- Fase L smoke tests: guard, archive por titular_user_id, close aggregated links, anomalia hold+anotação.
-- Tudo roda dentro de BEGIN/SAVEPOINT/ROLLBACK — nada é persistido. Não invoca as edge functions via HTTP
-- (isso exigiria banir/anonimizar de fato as contas reais de fixture — feito só com autorização extra).
-- SAVEPOINT/ROLLBACK TO SAVEPOINT são comandos top-level (não funcionam dentro de DO $$ ... $$),
-- por isso cada teste destrutivo é um DO block isolado entre SAVEPOINT/ROLLBACK TO no nível do script.

BEGIN;

-- Constantes de fixture (repetidas em cada DO block, já que DO blocks não compartilham estado)
-- _ct   = b31a6a89-55a8-431b-b0c4-764071270390
-- _ca   = eddba38d-fb2a-461c-997a-de91371cba65
-- _active_agg_id (aggregated_accounts, status=active hoje) = 44902951-d2fb-463d-b3a0-c6646e2bad36

-- === TEST 1: guard bloqueia CT com CA ativa; list_my_aggregated_accounts reflete isso ===
DO $$
DECLARE
  _ct uuid := 'b31a6a89-55a8-431b-b0c4-764071270390';
  _active_agg_id uuid := '44902951-d2fb-463d-b3a0-c6646e2bad36';
  _blocked boolean;
  _accounts json;
BEGIN
  SELECT public.account_deletion_blocked_by_active_cas(_ct) INTO _blocked;
  IF _blocked IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST1 FAIL: guard deveria retornar true (CA % ativa)', _active_agg_id;
  END IF;
  RAISE NOTICE 'TEST1 guard=true: OK';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _ct::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SELECT public.list_my_aggregated_accounts() INTO _accounts;
  RESET ROLE;

  IF NOT EXISTS (
    SELECT 1 FROM json_array_elements(_accounts->'accounts') acc
    WHERE (acc->>'id')::uuid = _active_agg_id AND acc->>'status' = 'active'
  ) THEN
    RAISE EXCEPTION 'TEST1 FAIL: list_my_aggregated_accounts não trouxe % ativa (%)', _active_agg_id, _accounts;
  END IF;
  RAISE NOTICE 'TEST1 list_my_aggregated_accounts inclui CA ativa (usado pra desabilitar botão no Perfil): OK';
END $$;

-- === TEST 2+4: CT desagrega CA; guard libera; archive move tudo pra archived_at; zero DELETE físico ===
SAVEPOINT sp_test2;

DO $$
DECLARE
  _ct uuid := 'b31a6a89-55a8-431b-b0c4-764071270390';
  _active_agg_id uuid := '44902951-d2fb-463d-b3a0-c6646e2bad36';
  _blocked boolean;
  _rpc json;
  _n_before_cli int; _n_before_ag int; _n_before_an int; _n_before_doc int;
  _n_after_cli int; _n_after_ag int;
  _total_cli_before int; _total_ag_before int;
  _total_cli_after int; _total_ag_after int;
BEGIN
  UPDATE public.aggregated_accounts
  SET status = 'removed'::public.aggregated_account_status, removed_at = now()
  WHERE id = _active_agg_id;

  SELECT public.account_deletion_blocked_by_active_cas(_ct) INTO _blocked;
  IF _blocked IS NOT FALSE THEN
    RAISE EXCEPTION 'TEST2 FAIL: guard deveria liberar (false) após desagregar';
  END IF;
  RAISE NOTICE 'TEST2 guard=false após desagregar: OK';

  SELECT count(*) FILTER (WHERE archived_at IS NULL) INTO _n_before_cli FROM public.clientes WHERE titular_user_id = _ct;
  SELECT count(*) FILTER (WHERE archived_at IS NULL) INTO _n_before_ag FROM public.agendamentos WHERE titular_user_id = _ct;
  SELECT count(*) FILTER (WHERE archived_at IS NULL) INTO _n_before_an FROM public.agendamento_anotacoes WHERE titular_user_id = _ct;
  SELECT count(*) FILTER (WHERE archived_at IS NULL) INTO _n_before_doc FROM public.paciente_documentos WHERE titular_user_id = _ct;
  SELECT count(*) INTO _total_cli_before FROM public.clientes WHERE titular_user_id = _ct;
  SELECT count(*) INTO _total_ag_before FROM public.agendamentos WHERE titular_user_id = _ct;

  SELECT public.clinical_archive_for_account_deletion(_ct, _ct, 'delete_account') INTO _rpc;
  RAISE NOTICE 'TEST2 RPC retorno: %', _rpc;

  IF (_rpc->'archived'->>'clientes')::int <> _n_before_cli THEN
    RAISE EXCEPTION 'TEST2 FAIL: clientes arquivados % != esperado %', (_rpc->'archived'->>'clientes'), _n_before_cli;
  END IF;
  IF (_rpc->'archived'->>'agendamentos')::int <> _n_before_ag THEN
    RAISE EXCEPTION 'TEST2 FAIL: agendamentos arquivados % != esperado %', (_rpc->'archived'->>'agendamentos'), _n_before_ag;
  END IF;
  IF (_rpc->'archived'->>'agendamento_anotacoes')::int <> _n_before_an THEN
    RAISE EXCEPTION 'TEST2 FAIL: anotações arquivadas % != esperado %', (_rpc->'archived'->>'agendamento_anotacoes'), _n_before_an;
  END IF;
  IF (_rpc->'archived'->>'paciente_documentos')::int <> _n_before_doc THEN
    RAISE EXCEPTION 'TEST2 FAIL: documentos arquivados % != esperado %', (_rpc->'archived'->>'paciente_documentos'), _n_before_doc;
  END IF;
  RAISE NOTICE 'TEST2 contagens de archive batem com estado ativo anterior: OK';

  SELECT count(*) FILTER (WHERE archived_at IS NULL) INTO _n_after_cli FROM public.clientes WHERE titular_user_id = _ct;
  SELECT count(*) FILTER (WHERE archived_at IS NULL) INTO _n_after_ag FROM public.agendamentos WHERE titular_user_id = _ct;
  SELECT count(*) INTO _total_cli_after FROM public.clientes WHERE titular_user_id = _ct;
  SELECT count(*) INTO _total_ag_after FROM public.agendamentos WHERE titular_user_id = _ct;

  IF _n_after_cli <> 0 OR _n_after_ag <> 0 THEN
    RAISE EXCEPTION 'TEST2 FAIL: ainda restam linhas ativas (clientes=%, agendamentos=%)', _n_after_cli, _n_after_ag;
  END IF;
  IF _total_cli_after <> _total_cli_before OR _total_ag_after <> _total_ag_before THEN
    RAISE EXCEPTION 'TEST2/TEST4 FAIL: total de linhas mudou (DELETE físico indevido) — clientes %->%, agendamentos %->%',
      _total_cli_before, _total_cli_after, _total_ag_before, _total_ag_after;
  END IF;
  RAISE NOTICE 'TEST2/TEST4 zero DELETE físico (só archived_at preenchido, total de linhas igual): OK';
END $$;

ROLLBACK TO SAVEPOINT sp_test2;
-- TEST2/4 revertido (SAVEPOINT) — fixtures reais preservados

-- === TEST 3: CA exclui a própria conta → aggregated_accounts vira removed; some da lista da CT ===
SAVEPOINT sp_test3;

DO $$
DECLARE
  _ct uuid := 'b31a6a89-55a8-431b-b0c4-764071270390';
  _ca uuid := 'eddba38d-fb2a-461c-997a-de91371cba65';
  _active_agg_id uuid := '44902951-d2fb-463d-b3a0-c6646e2bad36';
  _accounts json;
BEGIN
  PERFORM public.close_aggregated_links_on_account_deletion(_ca);

  IF NOT EXISTS (
    SELECT 1 FROM public.aggregated_accounts
    WHERE id = _active_agg_id AND status = 'removed'::public.aggregated_account_status AND removed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'TEST3 FAIL: link % não foi marcado removed', _active_agg_id;
  END IF;
  RAISE NOTICE 'TEST3 aggregated_accounts.status = removed: OK';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _ct::text, true);
  SELECT public.list_my_aggregated_accounts() INTO _accounts;
  RESET ROLE;

  IF EXISTS (
    SELECT 1 FROM json_array_elements(_accounts->'accounts') acc
    WHERE (acc->>'id')::uuid = _active_agg_id
  ) THEN
    RAISE EXCEPTION 'TEST3 FAIL: CA removida ainda aparece na lista da CT: %', _accounts;
  END IF;
  RAISE NOTICE 'TEST3 CA some da lista da CT (list_my_aggregated_accounts) sem lógica nova de UI: OK';
END $$;

ROLLBACK TO SAVEPOINT sp_test3;
-- TEST3 revertido (SAVEPOINT) — fixtures reais preservados

-- === TEST 5: admin purge de CA não toca dado sob titular_user_id da CT ===
SAVEPOINT sp_test5;

DO $$
DECLARE
  _ct uuid := 'b31a6a89-55a8-431b-b0c4-764071270390';
  _ca uuid := 'eddba38d-fb2a-461c-997a-de91371cba65';
  _rpc json;
  _ct_active_before int; _ct_active_after int;
BEGIN
  SELECT count(*) FILTER (WHERE archived_at IS NULL) INTO _ct_active_before FROM public.clientes WHERE titular_user_id = _ct;

  SELECT public.clinical_archive_for_account_deletion(_ca, _ct, 'admin_purge_user') INTO _rpc;
  RAISE NOTICE 'TEST5 RPC retorno (escopo CA): %', _rpc;

  SELECT count(*) FILTER (WHERE archived_at IS NULL) INTO _ct_active_after FROM public.clientes WHERE titular_user_id = _ct;

  IF _ct_active_after <> _ct_active_before THEN
    RAISE EXCEPTION 'TEST5 FAIL: purge da CA alterou clientes da CT (%->%)', _ct_active_before, _ct_active_after;
  END IF;

  IF (_rpc->'archived'->>'clientes')::int <> 0
     OR (_rpc->'archived'->>'agendamentos')::int <> 0
     OR (_rpc->'archived'->>'agendamento_anotacoes')::int <> 0
     OR (_rpc->'archived'->>'paciente_documentos')::int <> 0 THEN
    RAISE NOTICE 'TEST5 aviso: CA tinha dado clínico próprio (titular_user_id=CA) e foi arquivado — não é bug, é escopo correto: %', _rpc;
  ELSE
    RAISE NOTICE 'TEST5 CA sem dado clínico próprio; 0 linhas arquivadas no escopo dela: OK';
  END IF;
  RAISE NOTICE 'TEST5 dado da CT (titular_user_id=CT) intocado durante purge da CA: OK';
END $$;

ROLLBACK TO SAVEPOINT sp_test5;
-- TEST5 revertido (SAVEPOINT) — fixtures reais preservados

-- === TEST 6: hold aguardando_pagamento + anotação órfã anômala ===
SAVEPOINT sp_test6;

DO $$
DECLARE
  _ct uuid := 'b31a6a89-55a8-431b-b0c4-764071270390';
  _barbearia uuid := 'd4c60f02-162e-4417-9a13-739ba6439f00';
  _barbeiro uuid := '67a4c659-9d49-4ce0-80e3-3ef3d8f7fd00';
  _cliente uuid := 'c3071ac7-283b-47ef-be22-f05c83e20411';
  _hold_id uuid;
  _anot_id uuid;
  _rpc json;
  _n_anomalia int;
  _audit_count int;
BEGIN
  INSERT INTO public.agendamentos (
    barbearia_id, barbeiro_id, data, hora, cliente_nome, cliente_whatsapp, cliente_id,
    duracao_minutos, servicos_nomes, status, origem, titular_user_id
  ) VALUES (
    _barbearia, _barbeiro, CURRENT_DATE + 5, '10:00', 'Smoke L Hold', '5511999776655', _cliente,
    30, ARRAY['Smoke']::text[], 'aguardando_pagamento'::public.agendamento_status, 'link_publico', _ct
  ) RETURNING id INTO _hold_id;

  INSERT INTO public.agendamento_anotacoes (agendamento_id, conteudo, created_by, titular_user_id)
  VALUES (_hold_id, 'Anotação anômala em hold (estado inválido — só pra teste)', _ct, _ct)
  RETURNING id INTO _anot_id;

  RAISE NOTICE 'TEST6 fixture sintética criada: hold=%, anotacao=%', _hold_id, _anot_id;

  SELECT public.clinical_archive_for_account_deletion(_ct, _ct, 'test_hold_anomaly') INTO _rpc;
  RAISE NOTICE 'TEST6 RPC retorno: %', _rpc;

  _n_anomalia := (_rpc->>'hold_anotacao_anomalies_purged')::int;
  IF _n_anomalia <> 1 THEN
    RAISE EXCEPTION 'TEST6 FAIL: hold_anotacao_anomalies_purged=% (esperado 1)', _n_anomalia;
  END IF;
  IF (_rpc->>'holds_deleted')::int <> 1 THEN
    RAISE EXCEPTION 'TEST6 FAIL: holds_deleted=% (esperado 1)', (_rpc->>'holds_deleted');
  END IF;

  IF EXISTS (SELECT 1 FROM public.agendamentos WHERE id = _hold_id) THEN
    RAISE EXCEPTION 'TEST6 FAIL: hold % ainda existe após archive (deveria ter sido DELETE físico)', _hold_id;
  END IF;
  IF EXISTS (SELECT 1 FROM public.agendamento_anotacoes WHERE id = _anot_id) THEN
    RAISE EXCEPTION 'TEST6 FAIL: anotação órfã % ainda existe (deveria ter sido purgada antes do DELETE do hold)', _anot_id;
  END IF;
  RAISE NOTICE 'TEST6 hold + anotação órfã removidos fisicamente (FK RESTRICT não bloqueou): OK';

  SELECT count(*) INTO _audit_count
  FROM public.clinical_audit_log
  WHERE record_id = _anot_id
    AND table_name = 'agendamento_anotacoes'
    AND changed_fields->>'anomaly' = 'hold_with_anotacao';

  IF _audit_count <> 1 THEN
    RAISE EXCEPTION 'TEST6 FAIL: clinical_audit_log não registrou a anomalia (count=%)', _audit_count;
  END IF;
  RAISE NOTICE 'TEST6 anomalia registrada em clinical_audit_log antes do DELETE físico do hold: OK';
END $$;

ROLLBACK TO SAVEPOINT sp_test6;
-- TEST6 revertido (SAVEPOINT) — fixtures reais preservados
-- FASE L SMOKE (SQL-level): se chegou até aqui sem erro, TESTS 1,2,3,4,5,6 PASSED

ROLLBACK;
