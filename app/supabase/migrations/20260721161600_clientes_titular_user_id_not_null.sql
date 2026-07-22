-- Fase F: titular_user_id obrigatório em clientes (0 NULLs confirmados antes do push).

ALTER TABLE public.clientes
  ALTER COLUMN titular_user_id SET NOT NULL;
