-- Exclusão de paciente pelo CT: DELETE físico de todo dado clínico (nada arquivado, nada reativável).
-- Recadastro com mesmo WhatsApp cria linha nova (INSERT).

CREATE OR REPLACE FUNCTION public.delete_paciente_cadastro_painel(p_whatsapp_digits text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _titular uuid;
  _digits text;
  _visivel boolean;
  _ag_ids uuid[];
  _cliente_ids uuid[];
  _storage_paths text[];
  _avatar_path text;
  _n_an int := 0;
  _n_ag int := 0;
  _n_doc int := 0;
  _n_cli int := 0;
BEGIN
  IF _actor IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.aggregated_accounts aa
    WHERE aa.aggregated_user_id = _actor
      AND aa.status = 'active'::public.aggregated_account_status
  ) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  _titular := _actor;
  _digits := public.cliente_whatsapp_digits(p_whatsapp_digits);
  IF length(_digits) < 10 THEN
    RETURN json_build_object('error', 'invalid_whatsapp');
  END IF;

  SELECT (
    EXISTS (
      SELECT 1
      FROM public.clientes c
      WHERE c.titular_user_id = _titular
        AND public.whatsapp_match_digits(c.whatsapp, _digits)
        AND (
          c.barbearia_id IS NULL
          OR c.barbearia_id = ANY(public.painel_barbearia_ids_pacientes_visiveis())
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.agendamentos a
      WHERE a.titular_user_id = _titular
        AND public.whatsapp_match_digits(a.cliente_whatsapp, _digits)
        AND length(public.cliente_whatsapp_digits(a.cliente_whatsapp)) >= 10
        AND (
          public.painel_agendamento_visivel_pacientes(
            a.barbearia_id,
            a.barbeiro_id,
            public.painel_barbearia_ids_pacientes_visiveis()
          )
          OR (a.barbearia_id IS NULL AND a.titular_user_id = _titular)
        )
        AND (
          a.status = 'concluido'::public.agendamento_status
          OR EXISTS (
            SELECT 1
            FROM public.agendamento_anotacoes an
            WHERE an.agendamento_id = a.id
          )
        )
    )
  ) INTO _visivel;

  IF NOT _visivel THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  SELECT coalesce(array_agg(a.id), ARRAY[]::uuid[])
  INTO _ag_ids
  FROM public.agendamentos a
  WHERE a.titular_user_id = _titular
    AND public.whatsapp_match_digits(a.cliente_whatsapp, _digits);

  SELECT coalesce(array_agg(c.id), ARRAY[]::uuid[])
  INTO _cliente_ids
  FROM public.clientes c
  WHERE c.titular_user_id = _titular
    AND public.whatsapp_match_digits(c.whatsapp, _digits);

  SELECT coalesce(array_agg(pd.storage_path), ARRAY[]::text[])
  INTO _storage_paths
  FROM public.paciente_documentos pd
  WHERE pd.titular_user_id = _titular
    AND public.whatsapp_match_digits(pd.whatsapp_digits, _digits);

  IF EXISTS (
    SELECT 1
    FROM public.clientes c
    WHERE c.titular_user_id = _titular
      AND public.whatsapp_match_digits(c.whatsapp, _digits)
      AND c.avatar_url IS NOT NULL
      AND trim(c.avatar_url) <> ''
  ) THEN
    _avatar_path := _titular::text || '/patients/' || _digits || '.jpg';
    _storage_paths := array_append(_storage_paths, _avatar_path);
  END IF;

  DELETE FROM public.clinical_audit_log cal
  WHERE cal.titular_user_id = _titular
    AND (
      (cal.table_name = 'clientes' AND cal.record_id = ANY(_cliente_ids))
      OR (cal.table_name = 'agendamentos' AND cal.record_id = ANY(_ag_ids))
      OR (
        cal.table_name = 'agendamento_anotacoes'
        AND cal.record_id IN (
          SELECT an.id
          FROM public.agendamento_anotacoes an
          WHERE an.agendamento_id = ANY(_ag_ids)
        )
      )
      OR (
        cal.table_name = 'paciente_documentos'
        AND cal.record_id IN (
          SELECT pd.id
          FROM public.paciente_documentos pd
          WHERE pd.titular_user_id = _titular
            AND public.whatsapp_match_digits(pd.whatsapp_digits, _digits)
        )
      )
    );

  DELETE FROM public.agendamento_anotacoes an
  WHERE an.agendamento_id = ANY(_ag_ids);
  GET DIAGNOSTICS _n_an = ROW_COUNT;

  DELETE FROM public.agendamentos a
  WHERE a.id = ANY(_ag_ids);
  GET DIAGNOSTICS _n_ag = ROW_COUNT;

  DELETE FROM public.paciente_documentos pd
  WHERE pd.titular_user_id = _titular
    AND public.whatsapp_match_digits(pd.whatsapp_digits, _digits);
  GET DIAGNOSTICS _n_doc = ROW_COUNT;

  DELETE FROM public.clientes c
  WHERE c.titular_user_id = _titular
    AND public.whatsapp_match_digits(c.whatsapp, _digits);
  GET DIAGNOSTICS _n_cli = ROW_COUNT;

  DELETE FROM public.paciente_painel_removidos r
  WHERE r.titular_user_id = _titular
    AND public.whatsapp_match_digits(r.whatsapp_digits, _digits);

  RETURN json_build_object(
    'ok', true,
    'deleted_agendamento_anotacoes', _n_an,
    'deleted_agendamentos', _n_ag,
    'deleted_documentos', _n_doc,
    'deleted_clientes', _n_cli,
    'storage_paths', to_json(_storage_paths)
  );
END;
$$;

COMMENT ON FUNCTION public.delete_paciente_cadastro_painel(text) IS
  'CT titular: remove permanentemente cadastro, agendamentos, anotações, documentos e tokens do paciente (WhatsApp) na família. CA agregada: forbidden.';

-- create: INSERT novo (sem reativar cadastro excluído)
CREATE OR REPLACE FUNCTION public.create_paciente_cadastro_painel(
  p_whatsapp text,
  p_nome text,
  p_data_nascimento date DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _titular uuid := public.painel_titular_user_id();
  _digits text;
  _nome text;
  _barbearia_ids uuid[];
  _barbearia_id uuid;
  _existing_nome text;
  _cliente_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  _digits := public.cliente_whatsapp_digits(p_whatsapp);
  IF length(_digits) < 10 OR length(_digits) > 13 THEN
    RETURN json_build_object('error', 'invalid_whatsapp');
  END IF;

  _nome := trim(COALESCE(p_nome, ''));
  IF length(_nome) = 0 OR length(_nome) > 120 THEN
    RETURN json_build_object('error', 'invalid_name');
  END IF;

  _barbearia_ids := public.painel_barbearia_ids_editaveis();
  IF coalesce(array_length(_barbearia_ids, 1), 0) = 0 THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  _barbearia_id := _barbearia_ids[1];

  SELECT c.nome
  INTO _existing_nome
  FROM public.clientes c
  WHERE c.titular_user_id = _titular
    AND c.archived_at IS NULL
    AND public.whatsapp_match_digits(c.whatsapp, _digits)
  ORDER BY c.updated_at DESC
  LIMIT 1;

  IF _existing_nome IS NOT NULL THEN
    RETURN json_build_object(
      'error', 'already_exists',
      'whatsapp_digits', _digits,
      'cliente_nome', _existing_nome
    );
  END IF;

  -- Órfãos de exclusões antigas (soft delete): liberam UNIQUE (barbearia_id, whatsapp).
  DELETE FROM public.clientes c
  WHERE c.titular_user_id = _titular
    AND c.archived_at IS NOT NULL
    AND public.whatsapp_match_digits(c.whatsapp, _digits);

  INSERT INTO public.clientes (barbearia_id, nome, whatsapp, data_nascimento, titular_user_id)
  VALUES (_barbearia_id, _nome, _digits, p_data_nascimento, _titular)
  RETURNING id INTO _cliente_id;

  DELETE FROM public.paciente_painel_removidos r
  WHERE r.titular_user_id = _titular
    AND public.whatsapp_match_digits(r.whatsapp_digits, _digits);

  RETURN json_build_object(
    'ok', true,
    'patient', json_build_object(
      'cliente_id', _cliente_id,
      'whatsapp_digits', _digits,
      'cliente_nome', _nome,
      'data_nascimento', p_data_nascimento,
      'avatar_url', NULL,
      'ultimo_atendimento', CURRENT_DATE,
      'total_concluidos', 0,
      'total_anotacoes', 0,
      'can_rename_nome', true,
      'conta_ativada', false
    )
  );
END;
$$;

COMMENT ON FUNCTION public.create_paciente_cadastro_painel(text, text, date) IS
  'Cria cadastro novo de paciente no painel. Exclusão prévia remove o registro por completo — recadastro sempre INSERT.';

GRANT EXECUTE ON FUNCTION public.delete_paciente_cadastro_painel(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_paciente_cadastro_painel(text, text, date) TO authenticated;
