-- supabase:disable-transaction

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_disponibilidades_barbeiro_id
  ON public.disponibilidades (barbeiro_id);
