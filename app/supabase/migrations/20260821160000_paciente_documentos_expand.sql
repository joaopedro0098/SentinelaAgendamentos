-- Documentos: permitir upload para paciente com cadastro formal (sem exigir agendamento),
-- ampliar tipos (imagens, txt, csv, word, pdf) e remover limite de tamanho.

CREATE OR REPLACE FUNCTION public.paciente_documento_mime_permitido(p_mime text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(trim(coalesce(p_mime, ''))) IN (
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/pdf',
    'application/rtf',
    'text/plain',
    'text/csv',
    'text/comma-separated-values',
    'application/csv',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp'
  );
$$;

CREATE OR REPLACE FUNCTION public.painel_paciente_escopo_documentos(p_whatsapp_digits text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND length(public.cliente_whatsapp_digits(p_whatsapp_digits)) >= 10
    AND (
      EXISTS (
        SELECT 1
        FROM public.clientes c
        WHERE c.titular_user_id = public.painel_titular_user_id()
          AND c.archived_at IS NULL
          AND public.whatsapp_match_digits(c.whatsapp, p_whatsapp_digits)
          AND (
            c.barbearia_id = ANY(public.painel_barbearia_ids_pacientes_visiveis())
            OR (c.barbearia_id IS NULL AND auth.uid() = public.painel_titular_user_id())
          )
      )
      OR EXISTS (
        SELECT 1
        FROM public.agendamentos a
        WHERE a.titular_user_id = public.painel_titular_user_id()
          AND a.archived_at IS NULL
          AND public.cliente_whatsapp_digits(a.cliente_whatsapp) = public.cliente_whatsapp_digits(p_whatsapp_digits)
          AND (
            public.painel_agendamento_visivel_pacientes(
              a.barbearia_id,
              a.barbeiro_id,
              public.painel_barbearia_ids_pacientes_visiveis()
            )
            OR (a.barbearia_id IS NULL AND a.titular_user_id = public.painel_titular_user_id())
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
    );
$$;

CREATE OR REPLACE FUNCTION public.painel_paciente_documentos_visivel(p_whatsapp_digits text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.painel_paciente_escopo_documentos(p_whatsapp_digits);
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
    AND public.painel_paciente_escopo_documentos(p_whatsapp_digits)
    AND (
      EXISTS (
        SELECT 1
        FROM public.clientes c
        WHERE c.titular_user_id = public.painel_titular_user_id()
          AND c.archived_at IS NULL
          AND public.whatsapp_match_digits(c.whatsapp, p_whatsapp_digits)
          AND (
            c.barbearia_id = ANY(public.painel_barbearia_ids_editaveis())
            OR (c.barbearia_id IS NULL AND auth.uid() = public.painel_titular_user_id())
          )
      )
      OR EXISTS (
        SELECT 1
        FROM public.agendamentos a
        WHERE a.titular_user_id = public.painel_titular_user_id()
          AND a.archived_at IS NULL
          AND public.cliente_whatsapp_digits(a.cliente_whatsapp) = public.cliente_whatsapp_digits(p_whatsapp_digits)
          AND (
            a.barbearia_id = ANY(public.painel_barbearia_ids_editaveis())
            OR (a.barbearia_id IS NULL AND auth.uid() = public.painel_titular_user_id())
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
    );
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
  _editaveis uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  _digits := public.cliente_whatsapp_digits(p_whatsapp_digits);
  IF length(_digits) < 10 THEN
    RETURN json_build_object('error', 'invalid_whatsapp');
  END IF;

  IF NOT public.painel_pode_upload_documento_paciente(_digits) THEN
    RETURN json_build_object(
      'error', 'forbidden',
      'message', 'Sem permissão para anexar documentos a este paciente.'
    );
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

  _mime := lower(trim(coalesce(p_mime_type, '')));
  IF NOT public.paciente_documento_mime_permitido(_mime) THEN
    RETURN json_build_object(
      'error', 'invalid_mime_type',
      'message', 'Formato de arquivo não suportado.'
    );
  END IF;

  IF p_size_bytes IS NULL OR p_size_bytes <= 0 THEN
    RETURN json_build_object('error', 'empty_file', 'message', 'O arquivo está vazio.');
  END IF;

  IF p_size_bytes > 10485760 THEN
    RETURN json_build_object(
      'error', 'file_too_large',
      'message', 'Limite de 10MB por upload excedido. Suba uma quantidade menor e depois suba o restante.'
    );
  END IF;

  SELECT c.barbearia_id
  INTO _barbearia_id
  FROM public.clientes c
  WHERE c.titular_user_id = public.painel_titular_user_id()
    AND c.archived_at IS NULL
    AND public.whatsapp_match_digits(c.whatsapp, _digits)
  ORDER BY c.updated_at DESC
  LIMIT 1;

  IF _barbearia_id IS NULL THEN
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
  END IF;

  IF _barbearia_id IS NULL THEN
    _editaveis := public.painel_barbearia_ids_editaveis();
    IF coalesce(array_length(_editaveis, 1), 0) > 0 THEN
      _barbearia_id := _editaveis[1];
    END IF;
  END IF;

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

ALTER TABLE public.paciente_documentos
  DROP CONSTRAINT IF EXISTS paciente_documentos_size_check;

ALTER TABLE public.paciente_documentos
  ADD CONSTRAINT paciente_documentos_size_check CHECK (size_bytes > 0 AND size_bytes <= 10485760);

ALTER TABLE public.paciente_documentos
  DROP CONSTRAINT IF EXISTS paciente_documentos_mime_check;

ALTER TABLE public.paciente_documentos
  ADD CONSTRAINT paciente_documentos_mime_check CHECK (
    public.paciente_documento_mime_permitido(mime_type)
  );

UPDATE storage.buckets
SET
  file_size_limit = 10485760,
  allowed_mime_types = NULL
WHERE id = 'paciente-documentos';

COMMENT ON FUNCTION public.painel_paciente_escopo_documentos(text) IS
  'Paciente visível na aba Documentos: cadastro formal ativo ou histórico clínico (agendamento/anotação).';

GRANT EXECUTE ON FUNCTION public.paciente_documento_mime_permitido(text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.painel_paciente_escopo_documentos(text) TO authenticated;
