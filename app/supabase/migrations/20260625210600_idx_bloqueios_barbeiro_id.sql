-- supabase:disable-transaction
--
-- Pendência futura (NÃO incluir aqui): se o painel Bloqueios ficar lento, migration adicional com
-- (barbeiro_id, data) e índice parcial motivo = 'ferias'. Monitorar com EXPLAIN ANALYZE em
-- get_bloqueios_painel e bloqueio_conflita_agendamentos após índices em produção.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bloqueios_barbeiro_id
  ON public.bloqueios (barbeiro_id);
