-- Smoke Fase G: ativação de pacientes (Fases A/E) — cobertura completa das RPCs.
-- Nada persiste (dados): BEGIN + SAVEPOINT + ROLLBACK TO SAVEPOINT + ROLLBACK.
-- Run: npx supabase db query --linked -f supabase/tests/patient_activation_verify_smoke.sql

-- Prerequisite: pgcrypto gen_random_bytes lives in extensions schema.
ALTER FUNCTION public.get_or_create_patient_activation_link(text)
  SET search_path = public, extensions;
ALTER FUNCTION public.create_patient_activation_token(uuid)
  SET search_path = public, extensions;

BEGIN;

SAVEPOINT sp_patient_activation;

-- === verify sem fixtures (token vazio / not_found) ===
DO $$
DECLARE
  _empty json;
  _missing json;
BEGIN
  _empty := public.verify_patient_activation_token('');
  IF COALESCE((_empty->>'valid')::boolean, true) IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL verify empty token: %', _empty;
  END IF;
  IF _empty->>'reason' IS DISTINCT FROM 'invalid_token' THEN
    RAISE EXCEPTION 'FAIL verify empty reason: %', _empty;
  END IF;
  RAISE NOTICE 'PASS verify_patient_activation_token empty -> invalid_token';

  _missing := public.verify_patient_activation_token('000000000000000000000000000000');
  IF COALESCE((_missing->>'valid')::boolean, true) IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL verify missing token: %', _missing;
  END IF;
  IF _missing->>'reason' IS DISTINCT FROM 'not_found' THEN
    RAISE EXCEPTION 'FAIL verify missing reason: %', _missing;
  END IF;
  RAISE NOTICE 'PASS verify_patient_activation_token missing -> not_found';
END $$;

-- === fluxo completo com fixtures efêmeras ===
DO $$
DECLARE
  _ct uuid := 'b31a6a89-55a8-431b-b0c4-764071270390';
  _ca uuid := 'eddba38d-fb2a-461c-997a-de91371cba65';

  _wa_a text;
  _wa_b text;
  _wa_c text;

  _create json;
  _list json;
  _link json;
  _verify json;
  _concluir json;

  _cliente_a uuid;
  _cliente_b uuid;
  _cliente_c uuid;
  _barbearia_id uuid;

  _token1 text;
  _token2 text;
  _token_b text;
  _token_c text;
  _slug text;

  _expired_token text := 'smokeexpired' || replace(gen_random_uuid()::text, '-', '');
  _used_token text := 'smokeusedtok' || replace(gen_random_uuid()::text, '-', '');
  _n int;
BEGIN
  _wa_a := '55119' || lpad((floor(random() * 99999999)::bigint)::text, 8, '0');
  _wa_b := '55118' || lpad((floor(random() * 99999999)::bigint)::text, 8, '0');
  _wa_c := '55117' || lpad((floor(random() * 99999999)::bigint)::text, 8, '0');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _ct::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- create_paciente_cadastro_painel → cliente_id preenchido (regressão Fase A)
  SELECT public.create_paciente_cadastro_painel(_wa_a, 'Smoke G Paciente A', '1990-06-15'::date)
  INTO _create;
  IF COALESCE((_create->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL create_paciente_cadastro_painel: %', _create;
  END IF;
  _cliente_a := (_create->'patient'->>'cliente_id')::uuid;
  IF _cliente_a IS NULL THEN
    RAISE EXCEPTION 'FAIL create: patient.cliente_id is null — %', _create;
  END IF;
  IF COALESCE((_create->'patient'->>'conta_ativada')::boolean, true) IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL create: conta_ativada deveria ser false — %', _create;
  END IF;
  RAISE NOTICE 'PASS create_paciente_cadastro_painel retorna cliente_id e conta_ativada=false';

  SELECT c.barbearia_id INTO _barbearia_id
  FROM public.clientes c WHERE c.id = _cliente_a;

  -- list_pacientes_painel → cliente_id + conta_ativada=false (busca por WhatsApp)
  SELECT public.list_pacientes_painel(NULL, _wa_a, 50, 0) INTO _list;
  IF NOT EXISTS (
    SELECT 1
    FROM json_array_elements(_list->'pacientes') p
    WHERE (p->>'cliente_id')::uuid = _cliente_a
      AND COALESCE((p->>'conta_ativada')::boolean, true) IS FALSE
  ) THEN
    RAISE EXCEPTION 'FAIL list_pacientes_painel sem conta ativa: %', _list;
  END IF;
  RAISE NOTICE 'PASS list_pacientes_painel cliente_id + conta_ativada=false';

  -- get_or_create_patient_activation_link → no_formal_cadastro
  SELECT public.get_or_create_patient_activation_link('5511000000001') INTO _link;
  IF _link->>'error' IS DISTINCT FROM 'no_formal_cadastro' THEN
    RAISE EXCEPTION 'FAIL get_or_create no_formal_cadastro: %', _link;
  END IF;
  RAISE NOTICE 'PASS get_or_create_patient_activation_link no_formal_cadastro';

  -- get_or_create → caso feliz (token + slug)
  SELECT public.get_or_create_patient_activation_link(_wa_a) INTO _link;
  IF COALESCE((_link->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL get_or_create happy path: %', _link;
  END IF;
  _token1 := _link->>'token';
  _slug := _link->>'barbearia_slug';
  IF _token1 IS NULL OR length(_token1) < 10 OR _slug IS NULL THEN
    RAISE EXCEPTION 'FAIL get_or_create missing token/slug: %', _link;
  END IF;
  RAISE NOTICE 'PASS get_or_create_patient_activation_link happy path (token+slug)';

  -- get_or_create → invalida token anterior não usado
  SELECT public.get_or_create_patient_activation_link(_wa_a) INTO _link;
  _token2 := _link->>'token';
  IF _token2 IS NULL OR _token2 = _token1 THEN
    RAISE EXCEPTION 'FAIL get_or_create deveria gerar token novo: t1=% t2=%', _token1, _token2;
  END IF;
  SELECT count(*) INTO _n FROM public.patient_activation_tokens t WHERE t.token = _token1;
  IF _n <> 0 THEN
    RAISE EXCEPTION 'FAIL token anterior não usado deveria ser removido (count=%)', _n;
  END IF;
  RAISE NOTICE 'PASS get_or_create invalida token anterior não usado';

  RESET ROLE;

  -- verify → válido
  _verify := public.verify_patient_activation_token(_token2);
  IF COALESCE((_verify->>'valid')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL verify valid: %', _verify;
  END IF;
  IF _verify->>'barbearia_slug' IS DISTINCT FROM _slug THEN
    RAISE EXCEPTION 'FAIL verify slug: esperado % got %', _slug, _verify;
  END IF;
  RAISE NOTICE 'PASS verify_patient_activation_token valid';

  -- verify → expired
  INSERT INTO public.patient_activation_tokens (
    token, cliente_id, barbearia_id, whatsapp, nome, expires_at
  ) VALUES (
    _expired_token, _cliente_a, _barbearia_id, _wa_a, 'Smoke Expired', now() - interval '1 day'
  );
  _verify := public.verify_patient_activation_token(_expired_token);
  IF COALESCE((_verify->>'valid')::boolean, true) IS NOT FALSE
     OR _verify->>'reason' IS DISTINCT FROM 'expired' THEN
    RAISE EXCEPTION 'FAIL verify expired: %', _verify;
  END IF;
  RAISE NOTICE 'PASS verify_patient_activation_token expired';

  -- verify → already_used
  INSERT INTO public.patient_activation_tokens (
    token, cliente_id, barbearia_id, whatsapp, nome, used_at
  ) VALUES (
    _used_token, _cliente_a, _barbearia_id, _wa_a, 'Smoke Used', now()
  );
  _verify := public.verify_patient_activation_token(_used_token);
  IF COALESCE((_verify->>'valid')::boolean, true) IS NOT FALSE
     OR _verify->>'reason' IS DISTINCT FROM 'already_used' THEN
    RAISE EXCEPTION 'FAIL verify already_used: %', _verify;
  END IF;
  RAISE NOTICE 'PASS verify_patient_activation_token already_used';

  -- verify → already_has_account (paciente B ativado; token órfão ainda não usado)
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _ct::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SELECT public.create_paciente_cadastro_painel(_wa_b, 'Smoke G Paciente B') INTO _create;
  IF COALESCE((_create->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL create paciente B: %', _create;
  END IF;
  _cliente_b := (_create->'patient'->>'cliente_id')::uuid;

  SELECT public.get_or_create_patient_activation_link(_wa_b) INTO _link;
  _token_b := _link->>'token';
  RESET ROLE;

  _concluir := public.concluir_ativacao_paciente(_token_b, _ca);
  IF COALESCE((_concluir->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL concluir paciente B (setup already_has_account): %', _concluir;
  END IF;

  _token_b := 'smokeorphan' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.patient_activation_tokens (
    token, cliente_id, barbearia_id, whatsapp, nome
  ) VALUES (
    _token_b, _cliente_b, _barbearia_id, _wa_b, 'Smoke G Paciente B'
  );

  _verify := public.verify_patient_activation_token(_token_b);
  IF COALESCE((_verify->>'valid')::boolean, true) IS NOT FALSE
     OR _verify->>'reason' IS DISTINCT FROM 'already_has_account' THEN
    RAISE EXCEPTION 'FAIL verify already_has_account: %', _verify;
  END IF;
  RAISE NOTICE 'PASS verify_patient_activation_token already_has_account';

  -- concluir_ativacao_paciente → sucesso (paciente A, usuário CA)
  _concluir := public.concluir_ativacao_paciente(_token2, _ca);
  IF COALESCE((_concluir->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL concluir sucesso: %', _concluir;
  END IF;
  IF _concluir->>'barbearia_slug' IS DISTINCT FROM _slug THEN
    RAISE EXCEPTION 'FAIL concluir slug: %', _concluir;
  END IF;
  RAISE NOTICE 'PASS concluir_ativacao_paciente sucesso';

  -- list_pacientes_painel → conta_ativada=true
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _ct::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SELECT public.list_pacientes_painel(NULL, _wa_a, 50, 0) INTO _list;
  IF NOT EXISTS (
    SELECT 1
    FROM json_array_elements(_list->'pacientes') p
    WHERE (p->>'cliente_id')::uuid = _cliente_a
      AND COALESCE((p->>'conta_ativada')::boolean, false) IS TRUE
  ) THEN
    RAISE EXCEPTION 'FAIL list_pacientes_painel com conta ativa: %', _list;
  END IF;
  RAISE NOTICE 'PASS list_pacientes_painel conta_ativada=true';

  -- get_or_create → already_activated
  SELECT public.get_or_create_patient_activation_link(_wa_a) INTO _link;
  IF _link->>'error' IS DISTINCT FROM 'already_activated' THEN
    RAISE EXCEPTION 'FAIL get_or_create already_activated: %', _link;
  END IF;
  RAISE NOTICE 'PASS get_or_create_patient_activation_link already_activated';

  RESET ROLE;

  -- concluir_ativacao_paciente → idempotência (mesmo usuário)
  _concluir := public.concluir_ativacao_paciente(_token2, _ca);
  IF COALESCE((_concluir->>'success')::boolean, false) IS NOT TRUE
     OR COALESCE((_concluir->>'already_activated')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL concluir idempotência: %', _concluir;
  END IF;
  RAISE NOTICE 'PASS concluir_ativacao_paciente idempotência already_activated=true';

  -- concluir_ativacao_paciente → token_already_used (outro usuário)
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _ct::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SELECT public.create_paciente_cadastro_painel(_wa_c, 'Smoke G Paciente C') INTO _create;
  _cliente_c := (_create->'patient'->>'cliente_id')::uuid;
  SELECT public.get_or_create_patient_activation_link(_wa_c) INTO _link;
  _token_c := _link->>'token';
  RESET ROLE;

  _concluir := public.concluir_ativacao_paciente(_token_c, _ca);
  IF COALESCE((_concluir->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL concluir C com CA (setup): %', _concluir;
  END IF;

  _concluir := public.concluir_ativacao_paciente(_token_c, _ct);
  IF _concluir->>'error' IS DISTINCT FROM 'token_already_used' THEN
    RAISE EXCEPTION 'FAIL concluir token_already_used: %', _concluir;
  END IF;
  RAISE NOTICE 'PASS concluir_ativacao_paciente token_already_used (outro usuário)';

  RAISE NOTICE 'patient_activation_verify_smoke ALL PASS (16 assertions)';
END $$;

ROLLBACK TO SAVEPOINT sp_patient_activation;
ROLLBACK;
