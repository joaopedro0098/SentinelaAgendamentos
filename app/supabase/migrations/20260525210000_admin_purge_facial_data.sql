-- Admin purge: apaga biometria da conta e registros similares (incl. órfãos user_id NULL).

CREATE OR REPLACE FUNCTION public.admin_purge_facial_data_for_user(
  p_user_id uuid,
  p_max_distance double precision DEFAULT 0.55
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM public.facial_embeddings fe
  WHERE fe.user_id = p_user_id
     OR EXISTS (
       SELECT 1
       FROM public.facial_embeddings src
       WHERE src.user_id = p_user_id
         AND public.face_descriptor_distance(src.embedding, fe.embedding) < p_max_distance
     );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_purge_facial_data_for_user(uuid, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_purge_facial_data_for_user(uuid, double precision) TO service_role;

COMMENT ON FUNCTION public.admin_purge_facial_data_for_user(uuid, double precision) IS
  'Usado pelo painel admin: remove embeddings do usuário e qualquer registro facial similar (incl. órfãos).';
