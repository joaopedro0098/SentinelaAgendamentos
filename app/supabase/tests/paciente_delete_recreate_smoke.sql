-- Smoke: excluir paciente (hard delete) + recriar com mesmo WhatsApp.
-- Requires: 20260821153000_fix_recreate_paciente_after_delete.sql
-- Run: npx supabase db query --linked -f supabase/tests/paciente_delete_recreate_smoke.sql

BEGIN;
SAVEPOINT sp_delete_recreate;

DO $$
DECLARE
  _ct uuid := 'b31a6a89-55a8-431b-b0c4-764071270390';
  _wa text;
  _create json;
  _delete json;
  _recreate json;
  _cliente_id uuid;
  _cliente_id2 uuid;
  _exists boolean;
BEGIN
  _wa := '55116' || lpad((floor(random() * 99999999)::bigint)::text, 8, '0');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _ct::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  SELECT public.create_paciente_cadastro_painel(_wa, 'Smoke Hard Delete A') INTO _create;
  IF COALESCE((_create->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL create inicial: %', _create;
  END IF;
  _cliente_id := (_create->'patient'->>'cliente_id')::uuid;

  SELECT public.delete_paciente_cadastro_painel(_wa) INTO _delete;
  IF COALESCE((_delete->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL delete: %', _delete;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.clientes c
    WHERE c.id = _cliente_id
  ) INTO _exists;
  IF _exists THEN
    RAISE EXCEPTION 'FAIL cliente ainda existe após delete físico';
  END IF;

  SELECT public.create_paciente_cadastro_painel(_wa, 'Smoke Hard Delete B') INTO _recreate;
  IF COALESCE((_recreate->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL recreate após hard delete: %', _recreate;
  END IF;
  _cliente_id2 := (_recreate->'patient'->>'cliente_id')::uuid;

  IF _cliente_id2 IS NULL THEN
    RAISE EXCEPTION 'FAIL recreate sem cliente_id';
  END IF;

  RAISE NOTICE 'PASS hard delete + recreate mesmo WhatsApp (cliente novo permitido)';
END $$;

ROLLBACK TO SAVEPOINT sp_delete_recreate;
ROLLBACK;
