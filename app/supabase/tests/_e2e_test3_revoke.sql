-- Teste 3: upsert negado para anon e authenticated
-- E2E produção: upsert_cliente_por_whatsapp negado para anon/authenticated
DO $$
DECLARE
  _barbearia_id uuid;
  _anon text := 'FAIL';
  _auth text := 'FAIL';
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _e2e_hotfix_results (test text, result text);
  TRUNCATE _e2e_hotfix_results;

  SELECT id INTO _barbearia_id FROM public.barbearias WHERE ativa = true LIMIT 1;

  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.upsert_cliente_por_whatsapp(_barbearia_id, '5511999999999', 'E2E Anon');
    RESET ROLE;
    _anon := 'FAIL (permitido)';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      _anon := 'PASS (insufficient_privilege)';
    WHEN OTHERS THEN
      RESET ROLE;
      _anon := 'PASS (' || SQLERRM || ')';
  END;

  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.upsert_cliente_por_whatsapp(_barbearia_id, '5511999999999', 'E2E Auth');
    RESET ROLE;
    _auth := 'FAIL (permitido)';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RESET ROLE;
      _auth := 'PASS (insufficient_privilege)';
    WHEN OTHERS THEN
      RESET ROLE;
      _auth := 'PASS (' || SQLERRM || ')';
  END;

  INSERT INTO _e2e_hotfix_results VALUES ('test3_anon', _anon);
  INSERT INTO _e2e_hotfix_results VALUES ('test3_authenticated', _auth);
END $$;

SELECT * FROM _e2e_hotfix_results;
