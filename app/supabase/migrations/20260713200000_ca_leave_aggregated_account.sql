-- CA: desagregar-se do titular (mesma lógica de remove_aggregated_account, iniciada pela própria CA).

CREATE OR REPLACE FUNCTION public.leave_my_aggregated_account()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _account_id  uuid;
  _agg_email   text;
  _agg_user_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  SELECT aa.id, aa.email, aa.aggregated_user_id
  INTO _account_id, _agg_email, _agg_user_id
  FROM public.aggregated_accounts aa
  WHERE aa.aggregated_user_id = auth.uid()
    AND aa.status = 'active'::public.aggregated_account_status
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_aggregated');
  END IF;

  UPDATE public.aggregated_accounts
  SET status = 'removed', removed_at = now()
  WHERE id = _account_id;

  IF _agg_email IS NOT NULL THEN
    INSERT INTO public.trial_claims (email, user_id)
    VALUES (_agg_email, _agg_user_id)
    ON CONFLICT (email) DO NOTHING;
  END IF;

  IF _agg_user_id IS NOT NULL THEN
    UPDATE public.barbershops
    SET allow_client_public_booking = true
    WHERE owner_id = _agg_user_id;

    UPDATE public.barbearias b
    SET allow_client_public_booking = true
    FROM public.barbershops s
    WHERE s.owner_id = _agg_user_id AND s.slug = b.slug;
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.leave_my_aggregated_account() IS
  'CA ativa encerra agregação: restaura link público e bloqueia teste grátis permanente.';

GRANT EXECUTE ON FUNCTION public.leave_my_aggregated_account() TO authenticated;
