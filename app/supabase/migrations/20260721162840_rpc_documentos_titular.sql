-- Fase H onda 2: RPCs documentos — escopo titular_user_id + archived_at IS NULL.

CREATE OR REPLACE FUNCTION public.painel_paciente_documentos_visivel(p_whatsapp_digits text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND length(public.cliente_whatsapp_digits(p_whatsapp_digits)) >= 10
    AND EXISTS (
      SELECT 1
      FROM public.agendamentos a
      WHERE a.titular_user_id = public.painel_titular_user_id()
        AND a.archived_at IS NULL
        AND public.cliente_whatsapp_digits(a.cliente_whatsapp) = public.cliente_whatsapp_digits(p_whatsapp_digits)
        AND (
          a.status = 'concluido'::public.agendamento_status
          OR EXISTS (
            SELECT 1
            FROM public.agendamento_anotacoes an
            WHERE an.agendamento_id = a.id
              AND an.archived_at IS NULL
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.painel_pode_upload_documento_paciente(p_whatsapp_digits text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND length(public.cliente_whatsapp_digits(p_whatsapp_digits)) >= 10
    AND EXISTS (
      SELECT 1
      FROM public.agendamentos a
      WHERE a.titular_user_id = public.painel_titular_user_id()
        AND a.archived_at IS NULL
        AND public.cliente_whatsapp_digits(a.cliente_whatsapp) = public.cliente_whatsapp_digits(p_whatsapp_digits)
        AND (
          a.status = 'concluido'::public.agendamento_status
          OR EXISTS (
            SELECT 1
            FROM public.agendamento_anotacoes an
            WHERE an.agendamento_id = a.id
              AND an.archived_at IS NULL
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.list_paciente_documentos(p_whatsapp_digits text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _digits text;
  _items json;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  _digits := public.cliente_whatsapp_digits(p_whatsapp_digits);
  IF length(_digits) < 10 THEN
    RETURN json_build_object('error', 'invalid_whatsapp');
  END IF;

  IF NOT public.painel_paciente_documentos_visivel(_digits) THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  SELECT coalesce(json_agg(row_to_json(d) ORDER BY d.created_at DESC), '[]'::json)
  INTO _items
  FROM (
    SELECT
      pd.id,
      pd.file_name,
      pd.mime_type,
      pd.size_bytes,
      pd.storage_path,
      pd.created_at,
      (pd.uploaded_by = auth.uid()) AS can_delete
    FROM public.paciente_documentos pd
    WHERE pd.whatsapp_digits = _digits
      AND pd.titular_user_id = public.painel_titular_user_id()
      AND pd.archived_at IS NULL
  ) d;

  RETURN json_build_object('documentos', _items);
END;
$$;

CREATE OR REPLACE FUNCTION public.register_paciente_documento_painel(
  p_whatsapp_digits text,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _digits text;
  _barbearia_id uuid;
  _path text;
  _name text;
  _mime text;
  _doc_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  _digits := public.cliente_whatsapp_digits(p_whatsapp_digits);
  IF length(_digits) < 10 THEN
    RETURN json_build_object('error', 'invalid_whatsapp');
  END IF;

  IF NOT public.painel_pode_upload_documento_paciente(_digits) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  _path := trim(coalesce(p_storage_path, ''));
  IF _path = '' OR length(_path) > 1024 THEN
    RETURN json_build_object('error', 'invalid_storage_path');
  END IF;

  IF split_part(_path, '/', 1) <> auth.uid()::text THEN
    RETURN json_build_object('error', 'invalid_storage_path');
  END IF;

  _name := trim(coalesce(p_file_name, ''));
  IF _name = '' OR length(_name) > 255 THEN
    RETURN json_build_object('error', 'invalid_file_name');
  END IF;

  _mime := trim(coalesce(p_mime_type, ''));
  IF _mime NOT IN (
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/pdf',
    'image/jpeg'
  ) THEN
    RETURN json_build_object('error', 'invalid_mime_type', 'message', 'Formato de arquivo não suportado.');
  END IF;

  IF p_size_bytes IS NULL OR p_size_bytes <= 0 OR p_size_bytes > 10485760 THEN
    RETURN json_build_object('error', 'file_too_large', 'message', 'O arquivo excede o limite de 10 MB.');
  END IF;

  SELECT a.barbearia_id
  INTO _barbearia_id
  FROM public.agendamentos a
  WHERE a.titular_user_id = public.painel_titular_user_id()
    AND a.archived_at IS NULL
    AND public.cliente_whatsapp_digits(a.cliente_whatsapp) = _digits
    AND (
      a.status = 'concluido'::public.agendamento_status
      OR EXISTS (
        SELECT 1
        FROM public.agendamento_anotacoes an
        WHERE an.agendamento_id = a.id
          AND an.archived_at IS NULL
      )
    )
  ORDER BY a.data DESC, a.hora DESC
  LIMIT 1;

  INSERT INTO public.paciente_documentos (
    whatsapp_digits,
    barbearia_id,
    storage_path,
    file_name,
    mime_type,
    size_bytes,
    uploaded_by,
    titular_user_id
  )
  VALUES (
    _digits,
    _barbearia_id,
    _path,
    _name,
    _mime,
    p_size_bytes,
    auth.uid(),
    public.painel_titular_user_id()
  )
  RETURNING id INTO _doc_id;

  RETURN json_build_object(
    'ok', true,
    'id', _doc_id,
    'storage_path', _path,
    'file_name', _name,
    'mime_type', _mime,
    'size_bytes', p_size_bytes
  );
END;
$$;

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

  DELETE FROM public.paciente_documentos WHERE id = _row.id;

  RETURN json_build_object(
    'ok', true,
    'storage_path', _row.storage_path
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_paciente_documentos(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_paciente_documento_painel(text, text, text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_paciente_documento_painel(uuid) TO authenticated;
