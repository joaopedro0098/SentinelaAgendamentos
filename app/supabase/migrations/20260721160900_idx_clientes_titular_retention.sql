-- supabase:disable-transaction
--
-- Multi-tenant: titular_user_id primeiro — listagens futuras de prontuários além do prazo por CT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clientes_titular_retention
  ON public.clientes (titular_user_id, retention_until);
