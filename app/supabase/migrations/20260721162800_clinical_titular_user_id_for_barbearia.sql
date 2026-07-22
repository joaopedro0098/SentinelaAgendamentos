-- Fase H0: resolve titular_user_id (CT) a partir da barbearia — mesma lógica do backfill Fase B.

CREATE OR REPLACE FUNCTION public.clinical_titular_user_id_for_barbearia(p_barbearia_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT aa.owner_user_id
      FROM public.barbearias b
      JOIN public.barbershops s ON s.slug = b.slug
      JOIN public.aggregated_accounts aa
        ON aa.aggregated_user_id = s.owner_id
       AND aa.status = 'active'::public.aggregated_account_status
      WHERE b.id = p_barbearia_id
      LIMIT 1
    ),
    (
      SELECT s.owner_id
      FROM public.barbearias b
      JOIN public.barbershops s ON s.slug = b.slug
      WHERE b.id = p_barbearia_id
      LIMIT 1
    )
  );
$$;

COMMENT ON FUNCTION public.clinical_titular_user_id_for_barbearia(uuid) IS
  'Titular clínico (CT) para uma barbearia: owner_user_id se CA agregada ativa, senão owner da shop.';

GRANT EXECUTE ON FUNCTION public.clinical_titular_user_id_for_barbearia(uuid) TO authenticated, anon, service_role;
