-- Fase C: trilha de auditoria mínima para dados clínicos — schema apenas.
-- Nenhum trigger e nenhuma RPC chama log_clinical_audit ainda; wiring fica para depois
-- (decisão pendente: trigger AFTER INSERT/UPDATE vs. chamada explícita nas RPCs —
-- ver dúvida em aberto antes de avançar para essa etapa).

CREATE TABLE IF NOT EXISTS public.clinical_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titular_user_id uuid NOT NULL,
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('insert', 'update', 'archive')),
  actor_user_id uuid,
  changed_fields jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.clinical_audit_log IS
  'Trilha mínima de auditoria para dados clínicos (clientes, agendamentos, agendamento_anotacoes, paciente_documentos). Escopo por titular_user_id (CT custodiante).';

-- Tenant-first: titular_user_id como primeira coluna (Sentinela é multi-tenant — cada
-- clínica só deve varrer o próprio histórico, nunca cruzar com outras).
CREATE INDEX IF NOT EXISTS idx_clinical_audit_log_titular_created
  ON public.clinical_audit_log (titular_user_id, created_at DESC);

-- Lookup direto por registro (uuid quase único; não é scan cross-tenant na prática).
CREATE INDEX IF NOT EXISTS idx_clinical_audit_log_record
  ON public.clinical_audit_log (table_name, record_id);

ALTER TABLE public.clinical_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "titular reads own clinical audit log" ON public.clinical_audit_log;
CREATE POLICY "titular reads own clinical audit log"
  ON public.clinical_audit_log FOR SELECT TO authenticated
  USING (titular_user_id = auth.uid());

COMMENT ON POLICY "titular reads own clinical audit log" ON public.clinical_audit_log IS
  'Só a própria CT (auth.uid() = titular_user_id) lê seu log — não proxied via CA agregada ativa (painel_titular_user_id), pois o log é sensível e escopo de custódia, não de operação do dia a dia.';

CREATE OR REPLACE FUNCTION public.log_clinical_audit(
  p_titular_user_id uuid,
  p_table_name text,
  p_record_id uuid,
  p_action text,
  p_changed_fields jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_titular_user_id IS NULL OR p_table_name IS NULL OR p_record_id IS NULL OR p_action IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.clinical_audit_log (
    titular_user_id, table_name, record_id, action, actor_user_id, changed_fields
  )
  VALUES (
    p_titular_user_id, p_table_name, p_record_id, p_action, auth.uid(), p_changed_fields
  );
END;
$$;

COMMENT ON FUNCTION public.log_clinical_audit(uuid, text, uuid, text, jsonb) IS
  'Helper para registrar auditoria clínica. Ainda não é chamado por nenhuma RPC/trigger nesta fase — só schema pronto para uso futuro.';

GRANT EXECUTE ON FUNCTION public.log_clinical_audit(uuid, text, uuid, text, jsonb) TO authenticated, service_role;
