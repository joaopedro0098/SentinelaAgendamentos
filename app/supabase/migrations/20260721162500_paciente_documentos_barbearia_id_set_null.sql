-- Fase G: barbearia_id SET NULL em paciente_documentos.

ALTER TABLE public.paciente_documentos
  DROP CONSTRAINT IF EXISTS paciente_documentos_barbearia_id_fkey;

ALTER TABLE public.paciente_documentos
  ALTER COLUMN barbearia_id DROP NOT NULL;

ALTER TABLE public.paciente_documentos
  ADD CONSTRAINT paciente_documentos_barbearia_id_fkey
  FOREIGN KEY (barbearia_id) REFERENCES public.barbearias(id) ON DELETE SET NULL;
