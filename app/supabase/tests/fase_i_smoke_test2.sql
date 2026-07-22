DO $$
DECLARE
  _owner uuid := 'eddba38d-fb2a-461c-997a-de91371cba65';
  _titular uuid := 'b31a6a89-55a8-431b-b0c4-764071270390';
  _barbearia uuid := 'd4c60f02-162e-4417-9a13-739ba6439f00';
  _hold_id uuid;
  _rpc json;
  _barbeiro uuid;
BEGIN
  -- Limpa resíduos de tentativas anteriores
  DELETE FROM public.agendamentos a
  WHERE a.cliente_nome = 'Smoke Hold Fase I';

  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

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
    _barbearia, _barbeiro, '2099-01-15'::date, '10:30'::time,
    'Smoke Hold Fase I', '5511999990001', 30, ARRAY['Teste']::text[],
    'aguardando_pagamento'::public.agendamento_status, 'link_publico', _titular,
    now() + interval '15 minutes'
  )
  RETURNING id INTO _hold_id;

  _rpc := public.excluir_agendamento_painel(_hold_id);

  IF (_rpc->>'ok')::boolean IS NOT TRUE OR (_rpc->>'deleted')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST 2 FAIL: rpc=% hold_id=%', _rpc, _hold_id;
  END IF;

  IF EXISTS (SELECT 1 FROM public.agendamentos a WHERE a.id = _hold_id) THEN
    RAISE EXCEPTION 'TEST 2 FAIL: hold still exists';
  END IF;

  IF EXISTS (SELECT 1 FROM public.clinical_audit_log cal WHERE cal.record_id = _hold_id) THEN
    RAISE EXCEPTION 'TEST 2 FAIL: unexpected audit row';
  END IF;

  RAISE NOTICE 'TEST 2 PASS hold_id=% rpc=%', _hold_id, _rpc;
END;
$$;

SELECT json_build_object(
  'holds_restantes', (SELECT count(*)::int FROM public.agendamentos WHERE cliente_nome = 'Smoke Hold Fase I')
) AS test2_verify;
