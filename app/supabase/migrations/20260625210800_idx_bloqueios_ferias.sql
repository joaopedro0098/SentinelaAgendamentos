-- supabase:disable-transaction

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bloqueios_ferias
  ON public.bloqueios (barbeiro_id, data)
  WHERE motivo = 'ferias' AND hora_inicio IS NULL AND hora_fim IS NULL;
