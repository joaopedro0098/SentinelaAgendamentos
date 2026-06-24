-- supabase:disable-transaction

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_barbeiro_services_barbeiro_id
  ON public.barbeiro_services (barbeiro_id);
