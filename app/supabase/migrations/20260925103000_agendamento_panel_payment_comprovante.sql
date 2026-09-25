-- Snapshot de cobrança do painel + comprovante (tabela separada para lazy load).

CREATE TABLE IF NOT EXISTS public.agendamento_panel_pagamentos (
  agendamento_id uuid PRIMARY KEY REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  barbearia_id uuid NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  charge_kind text NOT NULL CHECK (charge_kind IN ('automatic', 'manual')),
  payment_mode text,
  deposit_type text,
  deposit_value int,
  payment_enable_card boolean,
  payment_enable_pix boolean,
  payment_pass_fee_card boolean,
  payment_pass_fee_pix boolean,
  payment_max_installments smallint,
  charge_centavos int,
  total_centavos int,
  remaining_centavos int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agendamento_panel_pagamentos_barbearia
  ON public.agendamento_panel_pagamentos (barbearia_id);

ALTER TABLE public.agendamento_panel_pagamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY agendamento_panel_pagamentos_select ON public.agendamento_panel_pagamentos
  FOR SELECT TO authenticated
  USING (
    barbearia_id = ANY(public.painel_barbearia_ids_agendamentos_editaveis())
    OR EXISTS (
      SELECT 1
      FROM public.agendamentos a
      WHERE a.id = agendamento_panel_pagamentos.agendamento_id
        AND public.painel_pode_ler_anotacao(a.id)
    )
  );

CREATE TABLE IF NOT EXISTS public.agendamento_comprovantes (
  agendamento_id uuid PRIMARY KEY REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  barbearia_id uuid NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  file_name text NOT NULL,
  size_bytes int NOT NULL,
  uploaded_by uuid REFERENCES auth.users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agendamento_comprovantes_agendamento
  ON public.agendamento_comprovantes (agendamento_id);

ALTER TABLE public.agendamento_comprovantes ENABLE ROW LEVEL SECURITY;

CREATE POLICY agendamento_comprovantes_select ON public.agendamento_comprovantes
  FOR SELECT TO authenticated
  USING (
    barbearia_id = ANY(public.painel_barbearia_ids_agendamentos_editaveis())
    OR EXISTS (
      SELECT 1
      FROM public.agendamentos a
      WHERE a.id = agendamento_comprovantes.agendamento_id
        AND public.painel_pode_ler_anotacao(a.id)
    )
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'agendamento-comprovantes',
  'agendamento-comprovantes',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/svg+xml'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY agendamento_comprovantes_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'agendamento-comprovantes'
    AND (
      (storage.foldername(name))[1]::uuid = ANY(public.painel_barbearia_ids_agendamentos_editaveis())
      OR EXISTS (
        SELECT 1
        FROM public.agendamentos a
        WHERE a.id = ((storage.foldername(name))[2])::uuid
          AND public.painel_pode_ler_anotacao(a.id)
      )
    )
  );

CREATE POLICY agendamento_comprovantes_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'agendamento-comprovantes'
    AND (storage.foldername(name))[1]::uuid = ANY(public.painel_barbearia_ids_agendamentos_editaveis())
  );

CREATE POLICY agendamento_comprovantes_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'agendamento-comprovantes'
    AND (storage.foldername(name))[1]::uuid = ANY(public.painel_barbearia_ids_agendamentos_editaveis())
  );

CREATE POLICY agendamento_comprovantes_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'agendamento-comprovantes'
    AND (storage.foldername(name))[1]::uuid = ANY(public.painel_barbearia_ids_agendamentos_editaveis())
  );

CREATE OR REPLACE FUNCTION public.painel_pode_editar_pagamento_agendamento(p_agendamento_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agendamentos a
    WHERE a.id = p_agendamento_id
      AND a.archived_at IS NULL
      AND a.barbearia_id = ANY(public.painel_barbearia_ids_agendamentos_editaveis())
  );
$$;

CREATE OR REPLACE FUNCTION public.painel_pode_ler_pagamento_agendamento(p_agendamento_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agendamentos a
    WHERE a.id = p_agendamento_id
      AND a.archived_at IS NULL
      AND (
        a.barbearia_id = ANY(public.painel_barbearia_ids_agendamentos_editaveis())
        OR public.painel_pode_ler_anotacao(a.id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.upsert_agendamento_panel_pagamento(
  p_agendamento_id uuid,
  p_charge_kind text,
  p_payment_mode text DEFAULT NULL,
  p_deposit_type text DEFAULT NULL,
  p_deposit_value int DEFAULT NULL,
  p_payment_enable_card boolean DEFAULT NULL,
  p_payment_enable_pix boolean DEFAULT NULL,
  p_payment_pass_fee_card boolean DEFAULT NULL,
  p_payment_pass_fee_pix boolean DEFAULT NULL,
  p_payment_max_installments int DEFAULT NULL,
  p_charge_centavos int DEFAULT NULL,
  p_total_centavos int DEFAULT NULL,
  p_remaining_centavos int DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF NOT public.painel_pode_editar_pagamento_agendamento(p_agendamento_id) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  IF p_charge_kind NOT IN ('automatic', 'manual') THEN
    RETURN json_build_object('error', 'invalid_charge_kind');
  END IF;

  SELECT a.barbearia_id INTO _barbearia_id
  FROM public.agendamentos a
  WHERE a.id = p_agendamento_id;

  IF _barbearia_id IS NULL THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  INSERT INTO public.agendamento_panel_pagamentos (
    agendamento_id,
    barbearia_id,
    charge_kind,
    payment_mode,
    deposit_type,
    deposit_value,
    payment_enable_card,
    payment_enable_pix,
    payment_pass_fee_card,
    payment_pass_fee_pix,
    payment_max_installments,
    charge_centavos,
    total_centavos,
    remaining_centavos,
    updated_at
  )
  VALUES (
    p_agendamento_id,
    _barbearia_id,
    p_charge_kind,
    p_payment_mode,
    p_deposit_type,
    p_deposit_value,
    p_payment_enable_card,
    p_payment_enable_pix,
    p_payment_pass_fee_card,
    p_payment_pass_fee_pix,
    LEAST(GREATEST(coalesce(p_payment_max_installments, 1), 1), 12)::smallint,
    p_charge_centavos,
    p_total_centavos,
    p_remaining_centavos,
    now()
  )
  ON CONFLICT (agendamento_id) DO UPDATE SET
    charge_kind = EXCLUDED.charge_kind,
    payment_mode = EXCLUDED.payment_mode,
    deposit_type = EXCLUDED.deposit_type,
    deposit_value = EXCLUDED.deposit_value,
    payment_enable_card = EXCLUDED.payment_enable_card,
    payment_enable_pix = EXCLUDED.payment_enable_pix,
    payment_pass_fee_card = EXCLUDED.payment_pass_fee_card,
    payment_pass_fee_pix = EXCLUDED.payment_pass_fee_pix,
    payment_max_installments = EXCLUDED.payment_max_installments,
    charge_centavos = EXCLUDED.charge_centavos,
    total_centavos = EXCLUDED.total_centavos,
    remaining_centavos = EXCLUDED.remaining_centavos,
    updated_at = now();

  RETURN json_build_object('ok', true);
END;
$$;

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
  _has_comprovante boolean;
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

  SELECT EXISTS (
    SELECT 1 FROM public.agendamento_comprovantes c WHERE c.agendamento_id = p_agendamento_id
  ) INTO _has_comprovante;

  RETURN json_build_object(
    'ok', true,
    'agendamento_id', _a.id,
    'status', _a.status::text,
    'payment_status', _a.payment_status::text,
    'valor_base_centavos', _a.valor_base_centavos,
    'valor_pago_centavos', _a.valor_pago_centavos,
    'valor_restante_centavos', _a.valor_restante_centavos,
    'has_panel_snapshot', _p.agendamento_id IS NOT NULL,
    'has_comprovante', _has_comprovante,
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
  WHERE c.agendamento_id = p_agendamento_id;

  IF NOT FOUND THEN
    RETURN json_build_object('found', false);
  END IF;

  RETURN json_build_object(
    'found', true,
    'storage_path', _row.storage_path,
    'mime_type', _row.mime_type,
    'file_name', _row.file_name,
    'size_bytes', _row.size_bytes,
    'uploaded_at', _row.uploaded_at
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
  _old_path text;
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

  SELECT c.storage_path INTO _old_path
  FROM public.agendamento_comprovantes c
  WHERE c.agendamento_id = p_agendamento_id;

  INSERT INTO public.agendamento_comprovantes (
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
    p_agendamento_id,
    _barbearia_id,
    p_storage_path,
    p_mime_type,
    p_file_name,
    p_size_bytes,
    auth.uid(),
    now()
  )
  ON CONFLICT (agendamento_id) DO UPDATE SET
    storage_path = EXCLUDED.storage_path,
    mime_type = EXCLUDED.mime_type,
    file_name = EXCLUDED.file_name,
    size_bytes = EXCLUDED.size_bytes,
    uploaded_by = EXCLUDED.uploaded_by,
    uploaded_at = now();

  RETURN json_build_object('ok', true, 'previous_storage_path', _old_path);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_paciente_anotacoes(
  p_whatsapp_digits text,
  p_barbeiro_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _titular uuid := public.painel_titular_user_id();
  _barbearia_ids uuid[];
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

  _barbearia_ids := public.painel_barbearia_ids_pacientes_visiveis();

  SELECT coalesce(json_agg(row_to_json(x) ORDER BY x.data DESC, x.hora DESC), '[]'::json)
  INTO _items
  FROM (
    SELECT
      a.id AS agendamento_id,
      a.data,
      a.hora,
      public.cliente_nome_exibicao(a.barbearia_id, a.cliente_id, a.cliente_whatsapp, a.cliente_nome) AS cliente_nome,
      a.cliente_whatsapp,
      a.barbearia_id,
      a.status,
      bb.nome AS barbeiro_nome,
      to_jsonb(coalesce(a.servicos_nomes, ARRAY[]::text[])) AS servicos_nomes,
      CASE
        WHEN public.painel_pode_ler_conteudo_anotacao(a.id) THEN an.conteudo
        ELSE NULL
      END AS anotacao_conteudo,
      an.updated_at AS anotacao_updated_at,
      public.painel_pode_escrever_anotacao(a.id) AS can_write,
      (
        EXISTS (
          SELECT 1 FROM public.agendamento_panel_pagamentos pp WHERE pp.agendamento_id = a.id
        )
        OR a.status = 'aguardando_pagamento'::public.agendamento_status
        OR a.valor_pago_centavos IS NOT NULL
      ) AS has_pagamento_info
    FROM public.agendamentos a
    JOIN public.barbeiros bb ON bb.id = a.barbeiro_id
    LEFT JOIN public.agendamento_anotacoes an
      ON an.agendamento_id = a.id
     AND an.archived_at IS NULL
    WHERE a.titular_user_id = _titular
      AND a.archived_at IS NULL
      AND (
        public.painel_agendamento_visivel_pacientes(a.barbearia_id, a.barbeiro_id, _barbearia_ids)
        OR (a.barbearia_id IS NULL AND a.titular_user_id = _titular)
      )
      AND public.cliente_whatsapp_digits(a.cliente_whatsapp) = _digits
      AND (p_barbeiro_id IS NULL OR a.barbeiro_id = p_barbeiro_id)
      AND (
        a.status = 'concluido'::public.agendamento_status
        OR an.id IS NOT NULL
      )
  ) x;

  RETURN json_build_object('items', _items);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_agendamento_panel_pagamento(
  uuid, text, text, text, int, boolean, boolean, boolean, boolean, int, int, int, int
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_agendamento_panel_pagamento_info(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_agendamento_comprovante_meta(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_agendamento_comprovante(uuid, text, text, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.painel_pode_editar_pagamento_agendamento(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.painel_pode_ler_pagamento_agendamento(uuid) TO authenticated;
