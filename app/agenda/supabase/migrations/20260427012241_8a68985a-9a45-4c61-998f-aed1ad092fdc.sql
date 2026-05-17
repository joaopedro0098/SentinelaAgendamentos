ALTER TABLE public.agendamentos
  ADD COLUMN duracao_minutos integer NOT NULL DEFAULT 30 CHECK (duracao_minutos > 0 AND duracao_minutos <= 480);