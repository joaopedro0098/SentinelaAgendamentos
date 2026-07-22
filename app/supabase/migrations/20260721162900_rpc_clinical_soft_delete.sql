-- Fase I: soft delete no painel — excluir agendamento, excluir documento, auditoria clínica.
-- Breaking: excluir_agendamento_painel void → json (requer diff frontend junto).
-- Exceção operacional: aguardando_pagamento continua DELETE físico (hold de slot/MP).

-- I-1: excluir_agendamento_painel — archive + cascata anotação (exceto hold de pagamento)
-- void → json exige DROP antes de CREATE OR REPLACE (42P13).
DROP FUNCTION IF EXISTS public.excluir_agendamento_painel(uuid);

CREATE OR REPLACE FUNCTION public.excluir_agendamento_painel(p_agendamento_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.agendamentos%ROWTYPE;
  _titular uuid := public.painel_titular_user_id();
  _editaveis uuid[] := public.painel_barbearia_ids_agendamentos_editaveis();
  _archived_anotacao_ids uuid[];
  _aid uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  SELECT * INTO _row
  FROM public.agendamentos a
  WHERE a.id = p_agendamento_id
    AND a.archived_at IS NULL;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  IF _row.titular_user_id IS DISTINCT FROM _titular THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  IF NOT (
    (_row.barbearia_id IS NULL AND _row.titular_user_id = auth.uid())
    OR (_row.barbearia_id = ANY(_editaveis))
  ) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  -- Hold de pagamento (link público): exclusão física — arquivar deixaria o slot bloqueado
  -- (create_public_booking_payment_hold não filtra archived_at) e foge do fluxo operacional MP.
  IF _row.status = 'aguardando_pagamento'::public.agendamento_status THEN
    DELETE FROM public.agendamentos
    WHERE id = p_agendamento_id
      AND status = 'aguardando_pagamento'::public.agendamento_status
      AND archived_at IS NULL;

    IF NOT FOUND THEN
      RETURN json_build_object('error', 'not_found');
    END IF;

    RETURN json_build_object('ok', true, 'deleted', true);
  END IF;

  WITH ann AS (
    UPDATE public.agendamento_anotacoes an
    SET
      archived_at = now(),
      archived_by = auth.uid()
    WHERE an.agendamento_id = p_agendamento_id
      AND an.archived_at IS NULL
    RETURNING an.id
  )
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO _archived_anotacao_ids
  FROM ann;

  UPDATE public.agendamentos a
  SET
    archived_at = now(),
    archived_by = auth.uid()
  WHERE a.id = p_agendamento_id
    AND a.archived_at IS NULL;

  FOREACH _aid IN ARRAY _archived_anotacao_ids LOOP
    PERFORM public.log_clinical_audit(
      _titular,
      'agendamento_anotacoes',
      _aid,
      'archive',
      jsonb_build_object('cascade_from_agendamento', p_agendamento_id)
    );
  END LOOP;

  PERFORM public.log_clinical_audit(
    _titular,
    'agendamentos',
    p_agendamento_id,
    'archive',
    jsonb_build_object(
      'status', _row.status::text,
      'cascade_anotacoes', cardinality(_archived_anotacao_ids)
    )
  );

  RETURN json_build_object('ok', true, 'archived', true);
END;
$$;

COMMENT ON FUNCTION public.excluir_agendamento_painel(uuid) IS
  'Painel: arquiva agendamento clínico (qualquer status exceto aguardando_pagamento) + anotações ativas em cascata. Hold de pagamento: DELETE físico (operacional). Escopo titular Fase H.';

-- I-2: delete_paciente_documento_painel — archive metadado; blob permanece no storage
CREATE OR REPLACE FUNCTION public.delete_paciente_documento_painel(p_documento_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.paciente_documentos%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  SELECT *
  INTO _row
  FROM public.paciente_documentos pd
  WHERE pd.id = p_documento_id
    AND pd.uploaded_by = auth.uid()
    AND pd.titular_user_id = public.painel_titular_user_id()
    AND pd.archived_at IS NULL;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  UPDATE public.paciente_documentos pd
  SET
    archived_at = now(),
    archived_by = auth.uid()
  WHERE pd.id = _row.id
    AND pd.archived_at IS NULL;

  PERFORM public.log_clinical_audit(
    _row.titular_user_id,
    'paciente_documentos',
    _row.id,
    'archive',
    jsonb_build_object('storage_path', _row.storage_path)
  );

  RETURN json_build_object(
    'ok', true,
    'archived', true,
    'storage_path', _row.storage_path
  );
END;
$$;

COMMENT ON FUNCTION public.delete_paciente_documento_painel(uuid) IS
  'Painel: arquiva metadado do documento. O blob no storage NÃO é removido (retenção até política futura).';

-- upsert_agendamento_anotacao: sem mudança de regra para texto vazio; só auditoria
CREATE OR REPLACE FUNCTION public.upsert_agendamento_anotacao(
  p_agendamento_id uuid,
  p_conteudo text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _conteudo text;
  _row record;
  _titular uuid;
  _had_active boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF NOT public.painel_pode_escrever_anotacao(p_agendamento_id) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  SELECT a.titular_user_id INTO _titular
  FROM public.agendamentos a
  WHERE a.id = p_agendamento_id
    AND a.archived_at IS NULL;

  IF _titular IS NULL THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.agendamento_anotacoes an
    WHERE an.agendamento_id = p_agendamento_id
      AND an.archived_at IS NULL
  ) INTO _had_active;

  _conteudo := trim(COALESCE(p_conteudo, ''));

  INSERT INTO public.agendamento_anotacoes (agendamento_id, conteudo, created_by, titular_user_id)
  VALUES (p_agendamento_id, _conteudo, auth.uid(), _titular)
  ON CONFLICT (agendamento_id)
  DO UPDATE SET
    conteudo = EXCLUDED.conteudo,
    updated_at = now()
  WHERE public.agendamento_anotacoes.archived_at IS NULL
  RETURNING id, conteudo, updated_at INTO _row;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  PERFORM public.log_clinical_audit(
    _titular,
    'agendamento_anotacoes',
    _row.id,
    CASE WHEN _had_active THEN 'update' ELSE 'insert' END,
    jsonb_build_object('conteudo_length', length(_conteudo))
  );

  RETURN json_build_object(
    'ok', true,
    'id', _row.id,
    'conteudo', _row.conteudo,
    'updated_at', _row.updated_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.excluir_agendamento_painel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_paciente_documento_painel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_agendamento_anotacao(uuid, text) TO authenticated;
