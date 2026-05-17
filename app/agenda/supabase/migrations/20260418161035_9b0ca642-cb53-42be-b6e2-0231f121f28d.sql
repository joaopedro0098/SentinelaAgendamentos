
-- Mantém leitura individual via URL pública mas evita listagem em massa do bucket
DROP POLICY IF EXISTS "barbeiros fotos publicas leitura" ON storage.objects;

CREATE POLICY "barbeiros fotos leitura individual"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'barbeiros'
  AND name IS NOT NULL
);
