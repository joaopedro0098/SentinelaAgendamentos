-- Onda 2 consolidated test runner
CREATE OR REPLACE FUNCTION pg_temp.run_onda2_tests(p_inject_orphan boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  _ct uuid := 'b31a6a89-55a8-431b-b0c4-764071270390';
  _ca uuid := 'eddba38d-fb2a-461c-997a-de91371cba65';
  _inicio date := (timezone('America/Sao_Paulo', now()) - interval '2 years')::date;
  _fim date := (timezone('America/Sao_Paulo', now()) + interval '1 year')::date;
  _orphan_id uuid := '780dde23-fe30-4025-aec7-c5cddd9eb680';
  _saved_barbearia uuid;
  _list jsonb;
  _agenda_ct jsonb;
  _agenda_ca jsonb;
  _rel jsonb;
  _baseline_total int;
  _baseline_faltas int;
  _baseline_cancel int;
  _ct_orphans jsonb;
  _ca_orphans jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', _ct::text, true);
  PERFORM set_config('role', 'authenticated', true);

  _list := public.list_pacientes_painel(NULL, NULL, 500, 0)::jsonb;
  _rel := public.get_relatorio_agendamentos(_inicio, _fim)::jsonb;

  SELECT
    count(*) FILTER (WHERE status = 'concluido'::public.agendamento_status),
    count(*) FILTER (WHERE status = 'nao_veio'::public.agendamento_status),
    count(*) FILTER (WHERE status = 'cancelado'::public.agendamento_status)
  INTO _baseline_total, _baseline_faltas, _baseline_cancel
  FROM public.agendamentos a
  WHERE a.titular_user_id = _ct
    AND a.archived_at IS NULL
    AND a.data BETWEEN _inicio AND _fim;

  IF p_inject_orphan THEN
    PERFORM set_config('role', 'postgres', true);
    SELECT a.barbearia_id INTO _saved_barbearia
    FROM public.agendamentos a WHERE a.id = _orphan_id;
    UPDATE public.agendamentos SET barbearia_id = NULL WHERE id = _orphan_id;
    PERFORM set_config('request.jwt.claim.sub', _ct::text, true);
    PERFORM set_config('role', 'authenticated', true);
  END IF;

  _agenda_ct := public.get_agendamentos_painel(_inicio, _fim)::jsonb;
  PERFORM set_config('request.jwt.claim.sub', _ca::text, true);
  _agenda_ca := public.get_agendamentos_painel(_inicio, _fim)::jsonb;
  PERFORM set_config('request.jwt.claim.sub', _ct::text, true);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', item->>'id',
    'can_manage', item->>'can_manage'
  )), '[]'::jsonb)
  INTO _ct_orphans
  FROM jsonb_array_elements(coalesce(_agenda_ct->'items', '[]'::jsonb)) item
  WHERE item->>'barbearia_id' IS NULL;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', item->>'id',
    'can_manage', item->>'can_manage'
  )), '[]'::jsonb)
  INTO _ca_orphans
  FROM jsonb_array_elements(coalesce(_agenda_ca->'items', '[]'::jsonb)) item
  WHERE item->>'barbearia_id' IS NULL;

  IF p_inject_orphan THEN
    PERFORM set_config('role', 'postgres', true);
    UPDATE public.agendamentos SET barbearia_id = _saved_barbearia WHERE id = _orphan_id;
  END IF;

  RETURN jsonb_build_object(
    'test_a', jsonb_build_object(
      'total_count', (_list->>'total_count')::int,
      'felipe_present', (
        SELECT count(*)
        FROM jsonb_array_elements(coalesce(_list->'pacientes', '[]'::jsonb)) p
        WHERE p->>'whatsapp_digits' IN ('11977687222', '5511977687222')
      ),
      'joao_pedro_present', (
        SELECT count(*)
        FROM jsonb_array_elements(coalesce(_list->'pacientes', '[]'::jsonb)) p
        WHERE p->>'cliente_nome' ILIKE '%João Pedro%'
      ),
      'orfaos_ativos_db', (
        SELECT count(*)
        FROM public.agendamentos a
        WHERE a.titular_user_id = _ct AND a.archived_at IS NULL AND a.barbearia_id IS NULL
      )
    ),
    'test_b', jsonb_build_object(
      'ct_orphan_items', _ct_orphans,
      'ca_orphan_items', _ca_orphans,
      'ct_all_orphans_can_manage', (
        SELECT CASE WHEN jsonb_array_length(_ct_orphans) = 0 THEN null
               ELSE bool_and((x->>'can_manage')::boolean) END
        FROM jsonb_array_elements(_ct_orphans) x
      ),
      'ca_any_orphan_can_manage', (
        SELECT CASE WHEN jsonb_array_length(_ca_orphans) = 0 THEN null
               ELSE bool_or(coalesce((x->>'can_manage')::boolean, false)) END
        FROM jsonb_array_elements(_ca_orphans) x
      )
    ),
    'test_c', jsonb_build_object(
      'baseline_total', _baseline_total,
      'baseline_faltas', _baseline_faltas,
      'baseline_cancel', _baseline_cancel,
      'rpc_total', (_rel->>'total')::int,
      'rpc_faltas', (_rel->>'total_faltas')::int,
      'rpc_cancel', (_rel->>'total_cancelamentos')::int,
      'totals_match', (
        _baseline_total = (_rel->>'total')::int
        AND _baseline_faltas = (_rel->>'total_faltas')::int
        AND _baseline_cancel = (_rel->>'total_cancelamentos')::int
      )
    )
  );
END;
$$;

SELECT jsonb_build_object('phase', 'ANTES', 'results', pg_temp.run_onda2_tests(false));
