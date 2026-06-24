-- Realtime: propaga alteração de intervalo da grade para painéis abertos (ex.: CA em outro navegador).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'barbeiros'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.barbeiros;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'barbershops'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.barbershops;
  END IF;
END $$;

ALTER TABLE public.barbeiros REPLICA IDENTITY FULL;
ALTER TABLE public.barbershops REPLICA IDENTITY FULL;
