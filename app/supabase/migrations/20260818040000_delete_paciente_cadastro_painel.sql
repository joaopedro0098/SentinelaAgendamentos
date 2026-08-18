-- Exclusão de cadastro de paciente: somente CT (nunca CA agregada). Soft-delete via archived_at.

CREATE OR REPLACE FUNCTION public.delete_paciente_cadastro_painel(p_whatsapp_digits text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _titular uuid := auth.uid();
  _digits text;
  _archived_clientes int;
  _archived_docs int;
BEGIN
  IF _titular IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.aggregated_accounts aa
    WHERE aa.aggregated_user_id = _titular
      AND aa.status = 'active'::public.aggregated_account_status
  ) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  _digits := public.cliente_whatsapp_digits(p_whatsapp_digits);
  IF length(_digits) < 10 THEN
    RETURN json_build_object('error', 'invalid_whatsapp');
  END IF;

  UPDATE public.clientes c
  SET archived_at = now(), archived_by = _titular
  WHERE c.titular_user_id = _titular
    AND c.archived_at IS NULL
    AND public.whatsapp_match_digits(c.whatsapp, _digits)
    AND (
      c.barbearia_id = ANY(public.painel_barbearia_ids_editaveis())
      OR (c.barbearia_id IS NULL AND c.titular_user_id = _titular)
    );

  GET DIAGNOSTICS _archived_clientes = ROW_COUNT;

  IF _archived_clientes = 0 THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  UPDATE public.paciente_documentos pd
  SET archived_at = now(), archived_by = _titular
  WHERE pd.titular_user_id = _titular
    AND pd.archived_at IS NULL
    AND public.whatsapp_match_digits(pd.whatsapp_digits, _digits);

  GET DIAGNOSTICS _archived_docs = ROW_COUNT;

  RETURN json_build_object(
    'ok', true,
    'archived_clientes', _archived_clientes,
    'archived_documentos', _archived_docs
  );
END;
$$;

COMMENT ON FUNCTION public.delete_paciente_cadastro_painel(text) IS
  'Arquiva cadastro do paciente (clientes + documentos). Apenas titular CT; CAs agregadas recebem forbidden.';

GRANT EXECUTE ON FUNCTION public.delete_paciente_cadastro_painel(text) TO authenticated;
