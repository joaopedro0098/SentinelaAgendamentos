-- Migration: Sistema de Tokens e RPCs para Ativação de Conta do Paciente

CREATE TABLE IF NOT EXISTS public.patient_activation_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  whatsapp text NOT NULL,
  nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  used_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_patient_activation_tokens_token ON public.patient_activation_tokens(token);
CREATE INDEX IF NOT EXISTS idx_patient_activation_tokens_whatsapp ON public.patient_activation_tokens(whatsapp);

ALTER TABLE public.patient_activation_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no public direct access patient_activation_tokens" ON public.patient_activation_tokens;
CREATE POLICY "no public direct access patient_activation_tokens"
  ON public.patient_activation_tokens FOR ALL USING (false) WITH CHECK (false);

-- RPC: Gerar token de ativação para um paciente cadastrado
CREATE OR REPLACE FUNCTION public.create_patient_activation_token(p_cliente_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cli record;
  _token text;
  _shop_nome text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  SELECT c.id, c.barbearia_id, c.nome, c.whatsapp, c.titular_user_id
  INTO _cli
  FROM public.clientes c
  WHERE c.id = p_cliente_id
    AND c.archived_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'cliente_not_found');
  END IF;

  -- Permissão: profissional/CA precisa ter visibilidade do paciente
  IF _cli.titular_user_id IS DISTINCT FROM public.painel_titular_user_id()
     AND NOT (_cli.barbearia_id = ANY(public.painel_barbearia_ids_pacientes_visiveis())) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  SELECT nome INTO _shop_nome
  FROM public.barbearias
  WHERE id = _cli.barbearia_id;

  -- Gera um token único de 24 caracteres legíveis
  _token := encode(gen_random_bytes(18), 'hex');

  INSERT INTO public.patient_activation_tokens (
    token,
    cliente_id,
    barbearia_id,
    whatsapp,
    nome
  )
  VALUES (
    _token,
    _cli.id,
    _cli.barbearia_id,
    _cli.whatsapp,
    _cli.nome
  );

  RETURN json_build_object(
    'success', true,
    'token', _token,
    'nome', _cli.nome,
    'whatsapp', _cli.whatsapp,
    'barbearia_nome', COALESCE(_shop_nome, 'Clínica')
  );
END;
$$;

-- RPC: Verificar validade do token de ativação (acessível publicamente via anon/authenticated)
CREATE OR REPLACE FUNCTION public.verify_patient_activation_token(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tok record;
  _shop_nome text;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RETURN json_build_object('valid', false, 'reason', 'invalid_token');
  END IF;

  SELECT t.*
  INTO _tok
  FROM public.patient_activation_tokens t
  WHERE t.token = trim(p_token)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('valid', false, 'reason', 'not_found');
  END IF;

  IF _tok.used_at IS NOT NULL THEN
    RETURN json_build_object('valid', false, 'reason', 'already_used');
  END IF;

  IF _tok.expires_at < now() THEN
    RETURN json_build_object('valid', false, 'reason', 'expired');
  END IF;

  SELECT nome INTO _shop_nome
  FROM public.barbearias
  WHERE id = _tok.barbearia_id;

  RETURN json_build_object(
    'valid', true,
    'token', _tok.token,
    'nome', _tok.nome,
    'whatsapp', _tok.whatsapp,
    'barbearia_nome', COALESCE(_shop_nome, 'Clínica')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_patient_activation_token(text) TO anon, authenticated;

-- RPC: Concluir ativação do paciente e associar auth_user_id em todas as clínicas
CREATE OR REPLACE FUNCTION public.concluir_ativacao_paciente(
  p_token text,
  p_auth_user_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tok record;
  _norm_whatsapp text;
  _updated_count int := 0;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RETURN json_build_object('error', 'token_invalid');
  END IF;

  IF p_auth_user_id IS NULL THEN
    RETURN json_build_object('error', 'auth_user_id_required');
  END IF;

  SELECT t.*
  INTO _tok
  FROM public.patient_activation_tokens t
  WHERE t.token = trim(p_token)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'token_not_found');
  END IF;

  IF _tok.used_at IS NOT NULL THEN
    -- Se já foi usado pelo mesmo usuário, retorna OK idenpotente
    IF EXISTS (
      SELECT 1 FROM public.clientes WHERE id = _tok.cliente_id AND auth_user_id = p_auth_user_id
    ) THEN
      RETURN json_build_object('success', true, 'already_activated', true);
    END IF;
    RETURN json_build_object('error', 'token_already_used');
  END IF;

  _norm_whatsapp := public.cliente_whatsapp_digits(_tok.whatsapp);

  -- Atualiza o auth_user_id de TODAS as linhas da tabela clientes que possuem o mesmo WhatsApp
  UPDATE public.clientes
  SET auth_user_id = p_auth_user_id,
      updated_at = now()
  WHERE public.cliente_whatsapp_digits(whatsapp) = _norm_whatsapp
    AND archived_at IS NULL;

  GET DIAGNOSTICS _updated_count = ROW_COUNT;

  -- Marca o token como utilizado
  UPDATE public.patient_activation_tokens
  SET used_at = now()
  WHERE id = _tok.id;

  RETURN json_build_object(
    'success', true,
    'linked_clinics_count', _updated_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.concluir_ativacao_paciente(text, uuid) TO authenticated;
