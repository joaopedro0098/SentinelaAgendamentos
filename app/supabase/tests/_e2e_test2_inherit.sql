-- Teste 2: inherit prioriza paciente_logado
-- E2E produção: inherit_appointment_push_subscription prioriza paciente_logado
DO $$
DECLARE
  _barbearia_id uuid;
  _barbeiro_id uuid;
  _titular uuid;
  _src_id uuid;
  _dst_id uuid;
  _inherited boolean;
  _endpoint text := 'https://e2e-hotfix.example/push/' || gen_random_uuid()::text;
  _result text := 'FAIL';
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _e2e_hotfix_results (test text, result text);
  TRUNCATE _e2e_hotfix_results;

  SELECT b.id, bb.id, public.clinical_titular_user_id_for_barbearia(b.id)
  INTO _barbearia_id, _barbeiro_id, _titular
  FROM public.barbearias b
  JOIN public.barbeiros bb ON bb.barbearia_id = b.id
  WHERE b.ativa = true
    AND public.clinical_titular_user_id_for_barbearia(b.id) IS NOT NULL
  LIMIT 1;

  IF _barbearia_id IS NULL THEN
    INSERT INTO _e2e_hotfix_results VALUES ('test2_inherit_push', 'SKIP (sem barbearia)');
    RETURN;
  END IF;

  INSERT INTO public.agendamentos (
    barbearia_id, barbeiro_id, data, hora, cliente_nome, cliente_whatsapp,
    duracao_minutos, servicos_nomes, status, origem, titular_user_id
  ) VALUES (
    _barbearia_id, _barbeiro_id, CURRENT_DATE + 61, '11:00', 'E2E Dst Painel', '5511977776666',
    30, ARRAY['t2-dst'], 'confirmado', 'painel', _titular
  ) RETURNING id INTO _dst_id;

  INSERT INTO public.agendamentos (
    barbearia_id, barbeiro_id, data, hora, cliente_nome, cliente_whatsapp,
    duracao_minutos, servicos_nomes, status, origem, titular_user_id
  ) VALUES (
    _barbearia_id, _barbeiro_id, CURRENT_DATE + 62, '11:30', 'E2E Src Paciente', '5511977776666',
    30, ARRAY['t2-src'], 'confirmado', 'paciente_logado', _titular
  ) RETURNING id INTO _src_id;

  INSERT INTO public.appointment_push_subscriptions (agendamento_id, endpoint, p256dh, auth)
  VALUES (_src_id, _endpoint, 'dGVzdC1wMjU2ZGg=', 'dGVzdC1hdXRo');

  INSERT INTO public.appointment_push_subscriptions (agendamento_id, endpoint, p256dh, auth)
  VALUES (_dst_id, 'https://e2e-hotfix.example/push/painel-' || gen_random_uuid()::text, 'cGFpbmVs', 'cGFpbmVs');

  _inherited := public.inherit_appointment_push_subscription(_dst_id, true);

  IF _inherited AND EXISTS (
    SELECT 1 FROM public.appointment_push_subscriptions s
    WHERE s.agendamento_id = _dst_id AND s.endpoint = _endpoint AND s.failed_at IS NULL
  ) THEN
    _result := 'PASS';
  ELSE
    _result := 'FAIL: inherit=' || _inherited::text;
  END IF;

  DELETE FROM public.appointment_push_subscriptions WHERE agendamento_id IN (_src_id, _dst_id);
  DELETE FROM public.agendamentos WHERE id IN (_src_id, _dst_id);

  INSERT INTO _e2e_hotfix_results VALUES ('test2_inherit_push', _result);
END $$;

SELECT * FROM _e2e_hotfix_results;
