-- Realtime para atualizar aba Pacientes ao salvar anotações.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'agendamento_anotacoes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agendamento_anotacoes;
  END IF;
END $$;

ALTER TABLE public.agendamento_anotacoes REPLICA IDENTITY FULL;
