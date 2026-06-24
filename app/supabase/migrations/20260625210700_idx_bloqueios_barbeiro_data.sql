-- supabase:disable-transaction

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bloqueios_barbeiro_data
  ON public.bloqueios (barbeiro_id, data);
