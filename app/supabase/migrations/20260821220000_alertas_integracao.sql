-- Alertas de integração: plataforma (Admin, barbearia_id NULL) vs barbearia (profissional).
-- Transição ok↔erro rastreada em integracao_condicao_estado.

CREATE TABLE IF NOT EXISTS public.integracao_condicao_estado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbearia_id uuid REFERENCES public.barbearias(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  condicao_ok boolean NOT NULL DEFAULT true,
  verificado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.integracao_condicao_estado IS
  'Estado da última checagem por escopo (global ou barbearia) e código de erro — detecta transição ok→erro vs erro contínuo.';

CREATE UNIQUE INDEX IF NOT EXISTS integracao_condicao_estado_global_codigo
  ON public.integracao_condicao_estado (codigo)
  WHERE barbearia_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS integracao_condicao_estado_barbearia_codigo
  ON public.integracao_condicao_estado (barbearia_id, codigo)
  WHERE barbearia_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.alertas_integracao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbearia_id uuid REFERENCES public.barbearias(id) ON DELETE CASCADE,
  integracao text NOT NULL,
  codigo text NOT NULL,
  titulo text NOT NULL,
  mensagem text NOT NULL,
  mensagem_acao text,
  severidade text NOT NULL DEFAULT 'warning'
    CHECK (severidade IN ('warning', 'error')),
  status text NOT NULL DEFAULT 'ativo'
    CHECK (status IN ('ativo', 'resolvido', 'dispensado')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  reaberto_em timestamptz,
  resolvido_em timestamptz,
  dispensado_em timestamptz
);

COMMENT ON TABLE public.alertas_integracao IS
  'Alertas de integração visíveis no Admin (barbearia_id NULL) ou na aba Integrações do profissional (barbearia_id preenchido).';

COMMENT ON COLUMN public.alertas_integracao.reaberto_em IS
  'Preenchido quando um alerta existente é reativado após transição ok→erro (mesma linha, sem INSERT novo).';

CREATE UNIQUE INDEX IF NOT EXISTS alertas_integracao_global_codigo
  ON public.alertas_integracao (codigo)
  WHERE barbearia_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS alertas_integracao_barbearia_codigo
  ON public.alertas_integracao (barbearia_id, codigo)
  WHERE barbearia_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_alertas_integracao_ativo_global
  ON public.alertas_integracao (atualizado_em DESC)
  WHERE barbearia_id IS NULL AND status = 'ativo';

CREATE INDEX IF NOT EXISTS idx_alertas_integracao_ativo_barbearia
  ON public.alertas_integracao (barbearia_id, atualizado_em DESC)
  WHERE barbearia_id IS NOT NULL AND status = 'ativo';

ALTER TABLE public.integracao_condicao_estado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alertas_integracao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no public integracao condicao estado" ON public.integracao_condicao_estado;
CREATE POLICY "no public integracao condicao estado"
  ON public.integracao_condicao_estado FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "no public alertas integracao" ON public.alertas_integracao;
CREATE POLICY "no public alertas integracao"
  ON public.alertas_integracao FOR ALL USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.registrar_erro_integracao(
  p_barbearia_id uuid,
  p_integracao text,
  p_codigo text,
  p_titulo text,
  p_mensagem text,
  p_mensagem_acao text DEFAULT NULL,
  p_severidade text DEFAULT 'warning'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _was_ok boolean := true;
  _alerta_id uuid;
  _now timestamptz := now();
BEGIN
  IF p_barbearia_id IS NULL THEN
    INSERT INTO public.integracao_condicao_estado (barbearia_id, codigo, condicao_ok, verificado_em)
    VALUES (NULL, p_codigo, true, _now)
    ON CONFLICT (codigo) WHERE barbearia_id IS NULL DO NOTHING;

    SELECT c.condicao_ok INTO _was_ok
    FROM public.integracao_condicao_estado c
    WHERE c.barbearia_id IS NULL AND c.codigo = p_codigo;

    IF _was_ok THEN
      INSERT INTO public.alertas_integracao (
        barbearia_id, integracao, codigo, titulo, mensagem, mensagem_acao, severidade, status, reaberto_em, atualizado_em
      )
      VALUES (
        NULL, p_integracao, p_codigo, p_titulo, p_mensagem, p_mensagem_acao, p_severidade, 'ativo', _now, _now
      )
      ON CONFLICT (codigo) WHERE barbearia_id IS NULL
      DO UPDATE SET
        integracao = EXCLUDED.integracao,
        titulo = EXCLUDED.titulo,
        mensagem = EXCLUDED.mensagem,
        mensagem_acao = EXCLUDED.mensagem_acao,
        severidade = EXCLUDED.severidade,
        status = 'ativo',
        resolvido_em = NULL,
        dispensado_em = NULL,
        reaberto_em = _now,
        atualizado_em = _now
      RETURNING id INTO _alerta_id;
    ELSE
      UPDATE public.alertas_integracao a
      SET atualizado_em = _now
      WHERE a.barbearia_id IS NULL
        AND a.codigo = p_codigo
        AND a.status = 'ativo'
      RETURNING a.id INTO _alerta_id;
    END IF;

    UPDATE public.integracao_condicao_estado c
    SET condicao_ok = false, verificado_em = _now
    WHERE c.barbearia_id IS NULL AND c.codigo = p_codigo;
  ELSE
    INSERT INTO public.integracao_condicao_estado (barbearia_id, codigo, condicao_ok, verificado_em)
    VALUES (p_barbearia_id, p_codigo, true, _now)
    ON CONFLICT (barbearia_id, codigo) WHERE barbearia_id IS NOT NULL DO NOTHING;

    SELECT c.condicao_ok INTO _was_ok
    FROM public.integracao_condicao_estado c
    WHERE c.barbearia_id = p_barbearia_id AND c.codigo = p_codigo;

    IF _was_ok THEN
      INSERT INTO public.alertas_integracao (
        barbearia_id, integracao, codigo, titulo, mensagem, mensagem_acao, severidade, status, reaberto_em, atualizado_em
      )
      VALUES (
        p_barbearia_id, p_integracao, p_codigo, p_titulo, p_mensagem, p_mensagem_acao, p_severidade, 'ativo', _now, _now
      )
      ON CONFLICT (barbearia_id, codigo) WHERE barbearia_id IS NOT NULL
      DO UPDATE SET
        integracao = EXCLUDED.integracao,
        titulo = EXCLUDED.titulo,
        mensagem = EXCLUDED.mensagem,
        mensagem_acao = EXCLUDED.mensagem_acao,
        severidade = EXCLUDED.severidade,
        status = 'ativo',
        resolvido_em = NULL,
        dispensado_em = NULL,
        reaberto_em = _now,
        atualizado_em = _now
      RETURNING id INTO _alerta_id;
    ELSE
      UPDATE public.alertas_integracao a
      SET atualizado_em = _now
      WHERE a.barbearia_id = p_barbearia_id
        AND a.codigo = p_codigo
        AND a.status = 'ativo'
      RETURNING a.id INTO _alerta_id;
    END IF;

    UPDATE public.integracao_condicao_estado c
    SET condicao_ok = false, verificado_em = _now
    WHERE c.barbearia_id = p_barbearia_id AND c.codigo = p_codigo;
  END IF;

  RETURN _alerta_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_ok_integracao(
  p_barbearia_id uuid,
  p_codigo text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _was_ok boolean := true;
  _now timestamptz := now();
BEGIN
  IF p_barbearia_id IS NULL THEN
    SELECT c.condicao_ok INTO _was_ok
    FROM public.integracao_condicao_estado c
    WHERE c.barbearia_id IS NULL AND c.codigo = p_codigo;

    IF NOT FOUND THEN
      INSERT INTO public.integracao_condicao_estado (barbearia_id, codigo, condicao_ok, verificado_em)
      VALUES (NULL, p_codigo, true, _now)
      ON CONFLICT (codigo) WHERE barbearia_id IS NULL DO NOTHING;
      RETURN;
    END IF;

    IF NOT _was_ok THEN
      UPDATE public.alertas_integracao a
      SET status = 'resolvido', resolvido_em = _now, atualizado_em = _now
      WHERE a.barbearia_id IS NULL
        AND a.codigo = p_codigo
        AND a.status = 'ativo';
    END IF;

    UPDATE public.integracao_condicao_estado c
    SET condicao_ok = true, verificado_em = _now
    WHERE c.barbearia_id IS NULL AND c.codigo = p_codigo;
  ELSE
    SELECT c.condicao_ok INTO _was_ok
    FROM public.integracao_condicao_estado c
    WHERE c.barbearia_id = p_barbearia_id AND c.codigo = p_codigo;

    IF NOT FOUND THEN
      INSERT INTO public.integracao_condicao_estado (barbearia_id, codigo, condicao_ok, verificado_em)
      VALUES (p_barbearia_id, p_codigo, true, _now)
      ON CONFLICT (barbearia_id, codigo) WHERE barbearia_id IS NOT NULL DO NOTHING;
      RETURN;
    END IF;

    IF NOT _was_ok THEN
      UPDATE public.alertas_integracao a
      SET status = 'resolvido', resolvido_em = _now, atualizado_em = _now
      WHERE a.barbearia_id = p_barbearia_id
        AND a.codigo = p_codigo
        AND a.status = 'ativo';
    END IF;

    UPDATE public.integracao_condicao_estado c
    SET condicao_ok = true, verificado_em = _now
    WHERE c.barbearia_id = p_barbearia_id AND c.codigo = p_codigo;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_alertas_integracao(p_limit int DEFAULT 100)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _limit int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  _limit := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);

  RETURN (
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.atualizado_em DESC), '[]'::json)
    FROM (
      SELECT
        a.id,
        a.integracao,
        a.codigo,
        a.titulo,
        a.mensagem,
        a.severidade,
        a.criado_em,
        a.reaberto_em,
        a.atualizado_em
      FROM public.alertas_integracao a
      WHERE a.barbearia_id IS NULL
        AND a.status = 'ativo'
      ORDER BY a.atualizado_em DESC
      LIMIT _limit
    ) t
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_alertas_integracao_count()
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN 0;
  END IF;

  RETURN (
    SELECT count(*)::int
    FROM public.alertas_integracao a
    WHERE a.barbearia_id IS NULL
      AND a.status = 'ativo'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_alertas_integracao_profissional(p_barbearia_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  IF p_barbearia_id IS NULL
    OR NOT (p_barbearia_id = ANY(public.painel_barbearia_ids_editaveis())) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  RETURN (
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.atualizado_em DESC), '[]'::json)
    FROM (
      SELECT
        a.id,
        a.integracao,
        a.codigo,
        a.titulo,
        a.mensagem,
        a.mensagem_acao,
        a.severidade,
        a.criado_em,
        a.reaberto_em,
        a.atualizado_em
      FROM public.alertas_integracao a
      WHERE a.barbearia_id = p_barbearia_id
        AND a.status = 'ativo'
      ORDER BY a.atualizado_em DESC
    ) t
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.dispensar_alerta_integracao(p_alerta_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  SELECT a.barbearia_id INTO _barbearia_id
  FROM public.alertas_integracao a
  WHERE a.id = p_alerta_id
    AND a.status = 'ativo'
    AND a.barbearia_id IS NOT NULL;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  IF NOT (_barbearia_id = ANY(public.painel_barbearia_ids_editaveis())) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  UPDATE public.alertas_integracao a
  SET status = 'dispensado', dispensado_em = now(), atualizado_em = now()
  WHERE a.id = p_alerta_id
    AND a.status = 'ativo';

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_erro_integracao(uuid, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_ok_integracao(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_alertas_integracao(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_alertas_integracao_count() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_alertas_integracao_profissional(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispensar_alerta_integracao(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.registrar_erro_integracao(uuid, text, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_ok_integracao(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_alertas_integracao(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_alertas_integracao_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_alertas_integracao_profissional(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispensar_alerta_integracao(uuid) TO authenticated;
