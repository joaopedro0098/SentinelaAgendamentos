-- Fase F: titular_user_id obrigatório em agendamento_anotacoes.

ALTER TABLE public.agendamento_anotacoes
  ALTER COLUMN titular_user_id SET NOT NULL;
