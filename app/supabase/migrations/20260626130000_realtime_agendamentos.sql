-- Realtime: atualiza painel de agendamentos ao inserir/alterar/excluir agendamentos.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'agendamentos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agendamentos;
  END IF;
END $$;

ALTER TABLE public.agendamentos REPLICA IDENTITY FULL;
