-- Lista só tokens ativos no painel (revogados permanecem no banco para auditoria).

CREATE OR REPLACE FUNCTION public.list_extension_connect_tokens()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid;
  _rows json;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::json)
  INTO _rows
  FROM (
    SELECT id, label, created_at, last_used_at
    FROM public.extension_connect_tokens
    WHERE user_id = _uid
      AND revoked_at IS NULL
  ) t;

  RETURN json_build_object('tokens', _rows);
END;
$$;
