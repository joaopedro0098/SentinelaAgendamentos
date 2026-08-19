-- Permite alterar WhatsApp do paciente no painel (mesma família titular).

CREATE OR REPLACE FUNCTION public.update_paciente_whatsapp_painel(
  p_whatsapp_digits text,
  p_new_whatsapp text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _titular uuid := public.painel_titular_user_id();
  _old text;
  _new text;
  _barbearia_ids_autor uuid[];
  _updated_clientes int := 0;
  _updated_agendamentos int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  _old := public.cliente_whatsapp_digits(p_whatsapp_digits);
  _new := public.cliente_whatsapp_digits(p_new_whatsapp);

  IF length(_old) < 10 THEN
    RETURN json_build_object('error', 'invalid_whatsapp');
  END IF;

  IF length(_new) < 10 OR length(_new) > 13 THEN
    RETURN json_build_object('error', 'invalid_whatsapp');
  END IF;

  IF _old = _new THEN
    RETURN json_build_object('ok', true, 'whatsapp_digits', _new, 'changed', false);
  END IF;

  _barbearia_ids_autor := public.painel_barbearia_ids_editaveis();
  IF coalesce(array_length(_barbearia_ids_autor, 1), 0) = 0 THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.agendamentos a
    WHERE a.titular_user_id = _titular
      AND a.archived_at IS NULL
      AND a.barbearia_id = ANY(_barbearia_ids_autor)
      AND public.cliente_whatsapp_digits(a.cliente_whatsapp) = _old
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
  AND NOT EXISTS (
    SELECT 1
    FROM public.clientes c
    WHERE c.titular_user_id = _titular
      AND c.archived_at IS NULL
      AND c.barbearia_id = ANY(_barbearia_ids_autor)
      AND public.whatsapp_match_digits(c.whatsapp, _old)
  ) THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.clientes c
    WHERE c.titular_user_id = _titular
      AND c.archived_at IS NULL
      AND public.whatsapp_match_digits(c.whatsapp, _new)
      AND NOT public.whatsapp_match_digits(c.whatsapp, _old)
  ) THEN
    RETURN json_build_object('error', 'already_exists');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.clientes c_target
    JOIN public.clientes c_conflict
      ON c_conflict.barbearia_id = c_target.barbearia_id
     AND c_conflict.archived_at IS NULL
     AND public.whatsapp_match_digits(c_conflict.whatsapp, _new)
     AND NOT public.whatsapp_match_digits(c_conflict.whatsapp, _old)
    WHERE c_target.titular_user_id = _titular
      AND c_target.archived_at IS NULL
      AND public.whatsapp_match_digits(c_target.whatsapp, _old)
  ) THEN
    RETURN json_build_object('error', 'already_exists');
  END IF;

  UPDATE public.clientes
  SET whatsapp = _new, updated_at = now()
  WHERE titular_user_id = _titular
    AND archived_at IS NULL
    AND public.whatsapp_match_digits(whatsapp, _old);
  GET DIAGNOSTICS _updated_clientes = ROW_COUNT;

  UPDATE public.agendamentos a
  SET cliente_whatsapp = _new
  WHERE a.titular_user_id = _titular
    AND a.archived_at IS NULL
    AND public.cliente_whatsapp_digits(a.cliente_whatsapp) = _old;
  GET DIAGNOSTICS _updated_agendamentos = ROW_COUNT;

  UPDATE public.paciente_documentos pd
  SET whatsapp_digits = _new
  WHERE pd.titular_user_id = _titular
    AND pd.archived_at IS NULL
    AND public.whatsapp_match_digits(pd.whatsapp_digits, _old);

  UPDATE public.patient_activation_tokens t
  SET whatsapp = _new
  WHERE public.whatsapp_match_digits(t.whatsapp, _old)
    AND EXISTS (
      SELECT 1
      FROM public.clientes c
      WHERE c.id = t.cliente_id
        AND c.titular_user_id = _titular
        AND c.archived_at IS NULL
    );

  UPDATE public.paciente_painel_removidos r
  SET whatsapp_digits = _new
  WHERE r.titular_user_id = _titular
    AND public.whatsapp_match_digits(r.whatsapp_digits, _old);

  UPDATE public.agendamentos a
  SET cliente_id = c.id
  FROM public.clientes c
  WHERE a.titular_user_id = _titular
    AND a.archived_at IS NULL
    AND c.titular_user_id = _titular
    AND c.archived_at IS NULL
    AND c.barbearia_id = a.barbearia_id
    AND public.whatsapp_match_digits(c.whatsapp, _new)
    AND public.cliente_whatsapp_digits(a.cliente_whatsapp) = _new;

  RETURN json_build_object(
    'ok', true,
    'whatsapp_digits', _new,
    'previous_whatsapp_digits', _old,
    'changed', true,
    'updated_clientes', _updated_clientes,
    'updated_agendamentos', _updated_agendamentos
  );
END;
$$;

COMMENT ON FUNCTION public.update_paciente_whatsapp_painel(text, text) IS
  'Atualiza WhatsApp do paciente na família titular (clientes, agendamentos, documentos e tokens de ativação).';

GRANT EXECUTE ON FUNCTION public.update_paciente_whatsapp_painel(text, text) TO authenticated;
