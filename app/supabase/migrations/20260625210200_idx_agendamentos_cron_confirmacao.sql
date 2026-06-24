-- supabase:disable-transaction

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agendamentos_cron_confirmacao
  ON public.agendamentos (data, status)
  WHERE requires_client_confirmation = true AND status = 'confirmado';
