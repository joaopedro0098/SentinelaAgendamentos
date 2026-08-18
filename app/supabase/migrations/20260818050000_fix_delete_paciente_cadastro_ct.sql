-- CT pode excluir cadastro de qualquer paciente visível na família (incl. atendidos por CA).
-- CAs agregadas continuam forbidden.

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
  _archived_clientes int;
  _archived_docs int;
  _visivel boolean;
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
        AND c.archived_at IS NULL
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
        AND a.archived_at IS NULL
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
              AND an.archived_at IS NULL
          )
        )
    )
  ) INTO _visivel;

  IF NOT _visivel THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  UPDATE public.clientes c
  SET archived_at = now(), archived_by = _actor
  WHERE c.titular_user_id = _titular
    AND c.archived_at IS NULL
    AND public.whatsapp_match_digits(c.whatsapp, _digits);

  GET DIAGNOSTICS _archived_clientes = ROW_COUNT;

  UPDATE public.paciente_documentos pd
  SET archived_at = now(), archived_by = _actor
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
  'CT titular: arquiva todos os clientes + documentos do WhatsApp na família de contas. CA agregada: forbidden.';

GRANT EXECUTE ON FUNCTION public.delete_paciente_cadastro_painel(text) TO authenticated;
