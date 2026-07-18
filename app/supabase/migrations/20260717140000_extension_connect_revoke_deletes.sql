-- Revogar = excluir registro (não há necessidade de reter tokens revogados).

CREATE OR REPLACE FUNCTION public.revoke_extension_connect_token(p_token_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  DELETE FROM public.extension_connect_tokens
  WHERE id = p_token_id
    AND user_id = _uid;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_extension_connect_token(p_token_hash text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row record;
BEGIN
  IF p_token_hash IS NULL OR length(trim(p_token_hash)) = 0 THEN
    RETURN json_build_object('valid', false);
  END IF;

  SELECT t.id, t.user_id
  INTO _row
  FROM public.extension_connect_tokens t
  WHERE t.token_hash = trim(p_token_hash)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('valid', false);
  END IF;

  UPDATE public.extension_connect_tokens
  SET last_used_at = now()
  WHERE id = _row.id;

  RETURN json_build_object('valid', true, 'user_id', _row.user_id, 'token_id', _row.id);
END;
$$;

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
  ) t;

  RETURN json_build_object('tokens', _rows);
END;
$$;

ALTER TABLE public.extension_connect_tokens
  DROP COLUMN IF EXISTS revoked_at;

COMMENT ON FUNCTION public.revoke_extension_connect_token(uuid) IS
  'Remove o token da extensão Sentinela Connect (revogação = exclusão).';
