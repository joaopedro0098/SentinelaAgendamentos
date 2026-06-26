-- Realtime: sincroniza permissões CT↔CA ao alterar toggles em aggregated_accounts.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'aggregated_accounts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.aggregated_accounts;
  END IF;
END $$;

ALTER TABLE public.aggregated_accounts REPLICA IDENTITY FULL;
