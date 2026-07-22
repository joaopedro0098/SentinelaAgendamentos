-- Fase F: titular_user_id obrigatório em paciente_documentos.

ALTER TABLE public.paciente_documentos
  ALTER COLUMN titular_user_id SET NOT NULL;
