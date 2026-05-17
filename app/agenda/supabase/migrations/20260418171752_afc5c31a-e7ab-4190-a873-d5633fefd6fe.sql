INSERT INTO storage.buckets (id, name, public)
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Logos publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'logos');

CREATE POLICY "Owner uploads own logo"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = (public.user_barbearia_id(auth.uid()))::text
);

CREATE POLICY "Owner updates own logo"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = (public.user_barbearia_id(auth.uid()))::text
);

CREATE POLICY "Owner deletes own logo"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = (public.user_barbearia_id(auth.uid()))::text
);