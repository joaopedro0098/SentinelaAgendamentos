
-- Bucket público para fotos dos barbeiros
INSERT INTO storage.buckets (id, name, public)
VALUES ('barbeiros', 'barbeiros', true)
ON CONFLICT (id) DO NOTHING;

-- Qualquer um pode ver as fotos (página pública de agendamento)
CREATE POLICY "barbeiros fotos publicas leitura"
ON storage.objects FOR SELECT
USING (bucket_id = 'barbeiros');

-- Donos da barbearia (autenticados) podem fazer upload em pasta com id da barbearia deles
CREATE POLICY "owner uploads foto barbeiro"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'barbeiros'
  AND (storage.foldername(name))[1] = public.user_barbearia_id(auth.uid())::text
);

CREATE POLICY "owner atualiza foto barbeiro"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'barbeiros'
  AND (storage.foldername(name))[1] = public.user_barbearia_id(auth.uid())::text
);

CREATE POLICY "owner deleta foto barbeiro"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'barbeiros'
  AND (storage.foldername(name))[1] = public.user_barbearia_id(auth.uid())::text
);
