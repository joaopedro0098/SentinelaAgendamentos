-- Fase G: titular_user_id RESTRICT em paciente_documentos.

ALTER TABLE public.paciente_documentos
  DROP CONSTRAINT IF EXISTS paciente_documentos_titular_user_id_fkey;

ALTER TABLE public.paciente_documentos
  ADD CONSTRAINT paciente_documentos_titular_user_id_fkey
  FOREIGN KEY (titular_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
