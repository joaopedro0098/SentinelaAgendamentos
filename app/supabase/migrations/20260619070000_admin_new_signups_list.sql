-- Admin: listar novos cadastros no período (detalhe ao clicar em "Novos cadastros").

CREATE OR REPLACE FUNCTION public.admin_new_signups_list(p_start date, p_end date)
RETURNS TABLE (
  email text,
  display_name text,
  contact_phone text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  _start date;
  _end date;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN;
  END IF;

  _start := COALESCE(p_start, CURRENT_DATE);
  _end := COALESCE(p_end, CURRENT_DATE);
  IF _start > _end THEN
    _start := p_end;
    _end := p_start;
  END IF;

  RETURN QUERY
  SELECT
    lower(trim(u.email))::text,
    COALESCE(nullif(trim(s.display_name), ''), '—')::text,
    s.contact_phone,
    s.created_at
  FROM public.barbershops s
  JOIN auth.users u ON u.id = s.owner_id
  WHERE s.owner_id IS NOT NULL
    AND NOT public.has_role(s.owner_id, 'admin'::public.app_role)
    AND public.barbershop_created_date_sp(s) BETWEEN _start AND _end
  ORDER BY s.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_new_signups_list(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_new_signups_list(date, date) TO authenticated;
