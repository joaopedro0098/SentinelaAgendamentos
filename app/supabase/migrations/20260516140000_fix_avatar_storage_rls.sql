-- Corrige RLS do bucket barbershop-avatars e UPDATE em barbershops (avatar_url).

DROP POLICY IF EXISTS "Users can upload to their own avatar folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload barbershop avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update barbershop avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete barbershop avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public can view barbershop avatars" ON storage.objects;

-- Leitura pública (bucket já é public; URLs diretas funcionam)
CREATE POLICY "avatar_select_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'barbershop-avatars');

-- Caminho: {user_id}/avatar.webp
CREATE POLICY "avatar_insert_own_folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'barbershop-avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

CREATE POLICY "avatar_update_own_folder"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'barbershop-avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'barbershop-avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

CREATE POLICY "avatar_delete_own_folder"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'barbershop-avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

DROP POLICY IF EXISTS "Owners can update their barbershop" ON public.barbershops;

CREATE POLICY "Owners can update their barbershop"
  ON public.barbershops FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);
