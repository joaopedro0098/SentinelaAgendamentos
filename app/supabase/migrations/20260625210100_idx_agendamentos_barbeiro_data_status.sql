-- supabase:disable-transaction

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agendamentos_barbeiro_data_status
  ON public.agendamentos (barbeiro_id, data, status);
