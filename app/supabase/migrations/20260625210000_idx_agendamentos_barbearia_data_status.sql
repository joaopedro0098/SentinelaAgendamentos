-- supabase:disable-transaction

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agendamentos_barbearia_data_status
  ON public.agendamentos (barbearia_id, data, status);
