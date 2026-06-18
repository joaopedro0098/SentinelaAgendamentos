-- Admin: listar todas as contas agregadas ativas/pendentes (com titular).

CREATE OR REPLACE FUNCTION public.admin_list_all_aggregated_accounts()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  _rows json;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.invited_at DESC), '[]'::json)
  INTO _rows
  FROM (
    SELECT
      aa.id,
      aa.email,
      aa.status,
      aa.invited_at,
      aa.activated_at,
      p.display_name AS aggregated_display_name,
      lower(trim(ou.email)) AS owner_email,
      coalesce(nullif(trim(bs.display_name), ''), '—') AS owner_shop_name
    FROM public.aggregated_accounts aa
    JOIN auth.users ou ON ou.id = aa.owner_user_id
    LEFT JOIN public.profiles p ON p.id = aa.aggregated_user_id
    LEFT JOIN public.barbershops bs ON bs.owner_id = aa.owner_user_id
    WHERE aa.status IN ('pending', 'awaiting_face', 'active')
  ) t;

  RETURN json_build_object('accounts', _rows);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_all_aggregated_accounts() TO authenticated;
