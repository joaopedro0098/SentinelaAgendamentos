-- supabase:disable-transaction
--
-- Multi-tenant (milhares de clínicas): titular_user_id como primeira coluna garante que
-- uma query de uma clínica nunca varre linhas de outra clínica para responder.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_paciente_documentos_titular_archived
  ON public.paciente_documentos (titular_user_id, archived_at);
