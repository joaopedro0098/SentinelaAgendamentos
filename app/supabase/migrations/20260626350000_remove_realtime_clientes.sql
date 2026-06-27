-- Realtime em clientes era só para refresh amplo de rename; substituído por broadcast pontual.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'clientes'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.clientes;
  END IF;
END $$;
