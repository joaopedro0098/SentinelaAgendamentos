-- supabase:disable-transaction

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_barbeiros_barbearia_ativo
  ON public.barbeiros (barbearia_id, ativo);
