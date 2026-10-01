-- Até 2 comprovantes por agendamento; metadados leves; visualização lazy por id.

ALTER TABLE public.agendamento_comprovantes
  ADD COLUMN IF NOT EXISTS id uuid;

UPDATE public.agendamento_comprovantes
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE public.agendamento_comprovantes
  ALTER COLUMN id SET NOT NULL,
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.agendamento_comprovantes
  DROP CONSTRAINT IF EXISTS agendamento_comprovantes_pkey;

ALTER TABLE public.agendamento_comprovantes
  ADD PRIMARY KEY (id);

CREATE INDEX IF NOT EXISTS idx_agendamento_comprovantes_agendamento_uploaded
  ON public.agendamento_comprovantes (agendamento_id, uploaded_at);

CREATE OR REPLACE FUNCTION public.get_agendamento_panel_pagamento_info(p_agendamento_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _a public.agendamentos%ROWTYPE;
  _p public.agendamento_panel_pagamentos%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF NOT public.painel_pode_ler_pagamento_agendamento(p_agendamento_id) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  SELECT * INTO _a FROM public.agendamentos a WHERE a.id = p_agendamento_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  SELECT * INTO _p FROM public.agendamento_panel_pagamentos ap WHERE ap.agendamento_id = p_agendamento_id;

  RETURN json_build_object(
    'ok', true,
    'agendamento_id', _a.id,
    'status', _a.status::text,
    'payment_status', _a.payment_status::text,
    'valor_base_centavos', _a.valor_base_centavos,
    'valor_pago_centavos', _a.valor_pago_centavos,
    'valor_restante_centavos', _a.valor_restante_centavos,
    'has_panel_snapshot', _p.agendamento_id IS NOT NULL,
    'charge_kind', _p.charge_kind,
    'payment_mode', _p.payment_mode,
    'deposit_type', _p.deposit_type,
    'deposit_value', _p.deposit_value,
    'payment_enable_card', _p.payment_enable_card,
    'payment_enable_pix', _p.payment_enable_pix,
    'payment_pass_fee_card', _p.payment_pass_fee_card,
    'payment_pass_fee_pix', _p.payment_pass_fee_pix,
    'payment_max_installments', _p.payment_max_installments,
    'charge_centavos', _p.charge_centavos,
    'total_centavos', _p.total_centavos,
    'remaining_centavos', _p.remaining_centavos
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_agendamento_comprovantes_meta(p_agendamento_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF NOT public.painel_pode_ler_pagamento_agendamento(p_agendamento_id) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  RETURN (
    SELECT COALESCE(
      json_build_object(
        'ok', true,
        'items', COALESCE(
          json_agg(
            json_build_object(
              'id', c.id,
              'mime_type', c.mime_type,
              'file_name', c.file_name
            )
            ORDER BY c.uploaded_at
          ),
          '[]'::json
        )
      ),
      json_build_object('ok', true, 'items', '[]'::json)
    )
    FROM public.agendamento_comprovantes c
    WHERE c.agendamento_id = p_agendamento_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_agendamento_comprovante_meta(p_agendamento_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.agendamento_comprovantes%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF NOT public.painel_pode_ler_pagamento_agendamento(p_agendamento_id) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  SELECT * INTO _row
  FROM public.agendamento_comprovantes c
  WHERE c.agendamento_id = p_agendamento_id
  ORDER BY c.uploaded_at
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('found', false);
  END IF;

  RETURN json_build_object(
    'found', true,
    'id', _row.id,
    'storage_path', _row.storage_path,
    'mime_type', _row.mime_type,
    'file_name', _row.file_name,
    'size_bytes', _row.size_bytes,
    'uploaded_at', _row.uploaded_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_agendamento_comprovante_by_id(p_comprovante_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.agendamento_comprovantes%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  SELECT * INTO _row
  FROM public.agendamento_comprovantes c
  WHERE c.id = p_comprovante_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  IF NOT public.painel_pode_ler_pagamento_agendamento(_row.agendamento_id) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  RETURN json_build_object(
    'ok', true,
    'id', _row.id,
    'agendamento_id', _row.agendamento_id,
    'storage_path', _row.storage_path,
    'mime_type', _row.mime_type,
    'file_name', _row.file_name
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.register_agendamento_comprovante(
  p_agendamento_id uuid,
  p_storage_path text,
  p_mime_type text,
  p_file_name text,
  p_size_bytes int
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_id uuid;
  _count int;
  _new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF NOT public.painel_pode_editar_pagamento_agendamento(p_agendamento_id) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  SELECT a.barbearia_id INTO _barbearia_id
  FROM public.agendamentos a
  WHERE a.id = p_agendamento_id;

  IF _barbearia_id IS NULL THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  SELECT count(*)::int INTO _count
  FROM public.agendamento_comprovantes c
  WHERE c.agendamento_id = p_agendamento_id;

  IF _count >= 2 THEN
    RETURN json_build_object(
      'error', 'limit_reached',
      'message', 'Máximo de 2 comprovantes por agendamento.'
    );
  END IF;

  _new_id := gen_random_uuid();

  INSERT INTO public.agendamento_comprovantes (
    id,
    agendamento_id,
    barbearia_id,
    storage_path,
    mime_type,
    file_name,
    size_bytes,
    uploaded_by,
    uploaded_at
  )
  VALUES (
    _new_id,
    p_agendamento_id,
    _barbearia_id,
    p_storage_path,
    p_mime_type,
    p_file_name,
    p_size_bytes,
    auth.uid(),
    now()
  );

  RETURN json_build_object('ok', true, 'id', _new_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_agendamento_comprovantes_meta(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_agendamento_comprovante_by_id(uuid) TO authenticated;
