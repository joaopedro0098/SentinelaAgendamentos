-- Fase L: archive clínico na exclusão de conta + guard titular com CAs + fechamento de vínculo CA.

-- ---------------------------------------------------------------------------
-- L-1: Guard — titular com CA pendente/ativa não pode excluir a própria conta
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.account_deletion_blocked_by_active_cas(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.aggregated_accounts aa
    WHERE aa.owner_user_id = p_user_id
      AND aa.status IN (
        'pending'::public.aggregated_account_status,
        'awaiting_face'::public.aggregated_account_status,
        'active'::public.aggregated_account_status
      )
  );
$$;

COMMENT ON FUNCTION public.account_deletion_blocked_by_active_cas(uuid) IS
  'True quando o usuário ainda é titular (owner_user_id) de alguma conta agregada pendente, aguardando face ou ativa. CT e AA (plano isento) seguem a mesma regra — deve remover/desagregar todas as CAs antes de excluir a própria conta. CA agregada (aggregated_user_id) nunca é bloqueada por esta função.';

REVOKE ALL ON FUNCTION public.account_deletion_blocked_by_active_cas(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_deletion_blocked_by_active_cas(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- L-2: Fechar vínculos aggregated_accounts quando a CA exclui a própria conta
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_aggregated_links_on_account_deletion(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _closed int := 0;
  _row record;
BEGIN
  FOR _row IN
    SELECT aa.id, aa.email, aa.aggregated_user_id
    FROM public.aggregated_accounts aa
    WHERE aa.aggregated_user_id = p_user_id
      AND aa.status IN (
        'pending'::public.aggregated_account_status,
        'awaiting_face'::public.aggregated_account_status,
        'active'::public.aggregated_account_status
      )
  LOOP
    UPDATE public.aggregated_accounts
    SET status = 'removed'::public.aggregated_account_status,
        removed_at = now()
    WHERE id = _row.id;

    _closed := _closed + 1;

    IF _row.email IS NOT NULL AND _row.aggregated_user_id IS NOT NULL THEN
      INSERT INTO public.trial_claims (email, user_id)
      VALUES (_row.email, _row.aggregated_user_id)
      ON CONFLICT (email) DO NOTHING;
    END IF;
  END LOOP;

  IF _closed > 0 THEN
    UPDATE public.barbershops
    SET allow_client_public_booking = true
    WHERE owner_id = p_user_id;

    UPDATE public.barbearias b
    SET allow_client_public_booking = true
    FROM public.barbershops s
    WHERE s.owner_id = p_user_id
      AND s.slug = b.slug;
  END IF;

  RETURN json_build_object('ok', true, 'closed', _closed);
END;
$$;

COMMENT ON FUNCTION public.close_aggregated_links_on_account_deletion(uuid) IS
  'Exclusão de conta da CA: marca aggregated_accounts como removed (evita status active órfão). Não altera o fluxo voluntário leave_my_aggregated_account.';

REVOKE ALL ON FUNCTION public.close_aggregated_links_on_account_deletion(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_aggregated_links_on_account_deletion(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- L-3: Archive bulk por titular_user_id (service_role / edge functions)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clinical_archive_for_account_deletion(
  p_titular_user_id uuid,
  p_actor_user_id   uuid DEFAULT NULL,
  p_reason          text DEFAULT 'account_deletion'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := COALESCE(p_actor_user_id, p_titular_user_id);
  _n_clientes int := 0;
  _n_ag int := 0;
  _n_an int := 0;
  _n_doc int := 0;
  _n_hold_del int := 0;
  _n_anomalia int := 0;
  _rid uuid;
  _archived_an_ids uuid[];
  _archived_ag_ids uuid[];
  _archived_doc_ids uuid[];
  _archived_cli_ids uuid[];
BEGIN
  IF p_titular_user_id IS NULL THEN
    RETURN json_build_object('error', 'invalid_titular');
  END IF;

  -- 0) Anotações órfãs em holds (estado inválido) — liberam DELETE do hold (FK RESTRICT)
  WITH anom AS (
    DELETE FROM public.agendamento_anotacoes an
    USING public.agendamentos a
    WHERE an.agendamento_id = a.id
      AND a.titular_user_id = p_titular_user_id
      AND a.archived_at IS NULL
      AND a.status = 'aguardando_pagamento'::public.agendamento_status
    RETURNING an.id, an.titular_user_id
  ),
  logged AS (
    INSERT INTO public.clinical_audit_log (
      titular_user_id, table_name, record_id, action, actor_user_id, changed_fields
    )
    SELECT
      COALESCE(anom.titular_user_id, p_titular_user_id),
      'agendamento_anotacoes',
      anom.id,
      'archive',
      _actor,
      jsonb_build_object(
        'reason', p_reason,
        'anomaly', 'hold_with_anotacao',
        'physical_delete', true
      )
    FROM anom
    RETURNING 1
  )
  SELECT count(*) INTO _n_anomalia FROM anom;

  -- 1) Holds operacionais: DELETE físico (exceção Fase I)
  WITH d AS (
    DELETE FROM public.agendamentos a
    WHERE a.titular_user_id = p_titular_user_id
      AND a.archived_at IS NULL
      AND a.status = 'aguardando_pagamento'::public.agendamento_status
    RETURNING a.id
  )
  SELECT count(*) INTO _n_hold_del FROM d;

  -- 2) Anotações ativas
  WITH u AS (
    UPDATE public.agendamento_anotacoes an
    SET archived_at = now(), archived_by = _actor
    WHERE an.titular_user_id = p_titular_user_id
      AND an.archived_at IS NULL
    RETURNING an.id
  )
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO _archived_an_ids FROM u;
  _n_an := coalesce(cardinality(_archived_an_ids), 0);

  FOREACH _rid IN ARRAY _archived_an_ids LOOP
    INSERT INTO public.clinical_audit_log (
      titular_user_id, table_name, record_id, action, actor_user_id, changed_fields
    )
    VALUES (
      p_titular_user_id, 'agendamento_anotacoes', _rid, 'archive', _actor,
      jsonb_build_object('reason', p_reason)
    );
  END LOOP;

  -- 3) Agendamentos ativos
  WITH u AS (
    UPDATE public.agendamentos a
    SET archived_at = now(), archived_by = _actor
    WHERE a.titular_user_id = p_titular_user_id
      AND a.archived_at IS NULL
    RETURNING a.id
  )
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO _archived_ag_ids FROM u;
  _n_ag := coalesce(cardinality(_archived_ag_ids), 0);

  FOREACH _rid IN ARRAY _archived_ag_ids LOOP
    INSERT INTO public.clinical_audit_log (
      titular_user_id, table_name, record_id, action, actor_user_id, changed_fields
    )
    VALUES (
      p_titular_user_id, 'agendamentos', _rid, 'archive', _actor,
      jsonb_build_object('reason', p_reason)
    );
  END LOOP;

  -- 4) Documentos (metadado; blob permanece)
  WITH u AS (
    UPDATE public.paciente_documentos pd
    SET archived_at = now(), archived_by = _actor
    WHERE pd.titular_user_id = p_titular_user_id
      AND pd.archived_at IS NULL
    RETURNING pd.id
  )
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO _archived_doc_ids FROM u;
  _n_doc := coalesce(cardinality(_archived_doc_ids), 0);

  FOREACH _rid IN ARRAY _archived_doc_ids LOOP
    INSERT INTO public.clinical_audit_log (
      titular_user_id, table_name, record_id, action, actor_user_id, changed_fields
    )
    VALUES (
      p_titular_user_id, 'paciente_documentos', _rid, 'archive', _actor,
      jsonb_build_object('reason', p_reason)
    );
  END LOOP;

  -- 5) Clientes
  WITH u AS (
    UPDATE public.clientes c
    SET archived_at = now(), archived_by = _actor
    WHERE c.titular_user_id = p_titular_user_id
      AND c.archived_at IS NULL
    RETURNING c.id
  )
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO _archived_cli_ids FROM u;
  _n_clientes := coalesce(cardinality(_archived_cli_ids), 0);

  FOREACH _rid IN ARRAY _archived_cli_ids LOOP
    INSERT INTO public.clinical_audit_log (
      titular_user_id, table_name, record_id, action, actor_user_id, changed_fields
    )
    VALUES (
      p_titular_user_id, 'clientes', _rid, 'archive', _actor,
      jsonb_build_object('reason', p_reason)
    );
  END LOOP;

  RETURN json_build_object(
    'ok', true,
    'titular_user_id', p_titular_user_id,
    'archived', json_build_object(
      'clientes', _n_clientes,
      'agendamentos', _n_ag,
      'agendamento_anotacoes', _n_an,
      'paciente_documentos', _n_doc
    ),
    'holds_deleted', _n_hold_del,
    'hold_anotacao_anomalies_purged', _n_anomalia
  );
END;
$$;

COMMENT ON FUNCTION public.clinical_archive_for_account_deletion(uuid, uuid, text) IS
  'Fase L: arquiva dado clínico por titular_user_id na exclusão de conta. Holds aguardando_pagamento: DELETE físico após purge de anotações órfãs inválidas. service_role only.';

REVOKE ALL ON FUNCTION public.clinical_archive_for_account_deletion(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clinical_archive_for_account_deletion(uuid, uuid, text) TO service_role;
