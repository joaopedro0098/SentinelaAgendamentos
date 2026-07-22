-- Fase F: titular_user_id obrigatório em agendamentos.

ALTER TABLE public.agendamentos
  ALTER COLUMN titular_user_id SET NOT NULL;
