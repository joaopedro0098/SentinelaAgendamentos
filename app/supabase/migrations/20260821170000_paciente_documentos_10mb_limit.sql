-- Restaura limite de 10 MB por upload (caso a migration expand já tenha sido aplicada sem limite).

ALTER TABLE public.paciente_documentos
  DROP CONSTRAINT IF EXISTS paciente_documentos_size_check;

ALTER TABLE public.paciente_documentos
  ADD CONSTRAINT paciente_documentos_size_check CHECK (size_bytes > 0 AND size_bytes <= 10485760);

UPDATE storage.buckets
SET file_size_limit = 10485760
WHERE id = 'paciente-documentos';
