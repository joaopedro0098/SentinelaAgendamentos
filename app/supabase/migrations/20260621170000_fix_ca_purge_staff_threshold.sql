-- Corrige purge_ca_staff_for_user: só apaga colaboradores se houver 2 ou mais.

CREATE OR REPLACE FUNCTION public.purge_ca_staff_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shop_id uuid;
  _slug    text;
  _staff_count int;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT bs.id, bs.slug
  INTO _shop_id, _slug
  FROM public.barbershops bs
  WHERE bs.owner_id = p_user_id
  LIMIT 1;

  IF _shop_id IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*)::int INTO _staff_count
  FROM public.staff s
  WHERE s.barbershop_id = _shop_id;

  IF _staff_count < 2 THEN
    RETURN;
  END IF;

  DELETE FROM public.staff
  WHERE barbershop_id = _shop_id;

  IF _slug IS NOT NULL THEN
    PERFORM public.ensure_agenda_from_barbershop_slug(_slug);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.purge_ca_staff_for_user(uuid) IS
  'Ao virar CA: apaga todos os colaboradores somente se houver 2+; com 1, mantém intacto.';
