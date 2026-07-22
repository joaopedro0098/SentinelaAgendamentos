-- supabase:disable-transaction
--
-- Multi-tenant (milhares de clínicas): titular_user_id como primeira coluna garante que
-- uma query de uma clínica nunca varre linhas de outra clínica para responder.
-- Não substitui os índices existentes por barbearia_id/barbeiro_id (grade operacional
-- continua filtrando por lá); este é aditivo, para consultas por titular (ficha do paciente,
-- futura listagem de arquivados, etc.).

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agendamentos_titular_archived
  ON public.agendamentos (titular_user_id, archived_at);
