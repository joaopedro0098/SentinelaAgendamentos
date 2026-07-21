-- Handoff mobile: claim idempotente, envio via RPC (sem edge obrigatória), retry no mesmo QR.

CREATE OR REPLACE FUNCTION public.claim_facial_handoff_session(p_session_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.facial_handoff_sessions%ROWTYPE;
  _updated int;
  _expires timestamptz;
BEGIN
  IF p_session_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT * INTO _row FROM public.facial_handoff_sessions WHERE id = p_session_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF _row.expires_at <= now() THEN
    UPDATE public.facial_handoff_sessions
    SET status = 'failed', fail_reason = 'expired'
    WHERE id = p_session_id AND status IN ('pending', 'claimed');
    RETURN json_build_object('ok', false, 'error', 'expired');
  END IF;

  IF _row.status = 'claimed' THEN
    RETURN json_build_object('ok', true, 'expires_at', _row.expires_at);
  END IF;

  IF _row.status = 'completed' THEN
    RETURN json_build_object('ok', true, 'expires_at', _row.expires_at, 'already_completed', true);
  END IF;

  IF _row.status = 'consumed' THEN
    RETURN json_build_object('ok', true, 'expires_at', _row.expires_at, 'already_completed', true);
  END IF;

  IF _row.status <> 'pending' THEN
    RETURN json_build_object('ok', false, 'error', 'expired');
  END IF;

  UPDATE public.facial_handoff_sessions
  SET status = 'claimed', claimed_at = coalesce(claimed_at, now())
  WHERE id = p_session_id
    AND status = 'pending'
    AND expires_at > now();

  GET DIAGNOSTICS _updated = ROW_COUNT;
  IF _updated = 0 THEN
    SELECT * INTO _row FROM public.facial_handoff_sessions WHERE id = p_session_id;
    IF _row.status = 'claimed' THEN
      RETURN json_build_object('ok', true, 'expires_at', _row.expires_at);
    END IF;
    RETURN json_build_object('ok', false, 'error', 'already_claimed');
  END IF;

  SELECT expires_at INTO _expires FROM public.facial_handoff_sessions WHERE id = p_session_id;

  RETURN json_build_object('ok', true, 'expires_at', _expires);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_facial_handoff_verification(
  p_session_id uuid,
  p_embedding real[]
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.facial_handoff_sessions%ROWTYPE;
  _check json;
  _trial boolean;
  _match boolean;
BEGIN
  IF p_session_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT * INTO _row FROM public.facial_handoff_sessions WHERE id = p_session_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF _row.expires_at <= now() THEN
    UPDATE public.facial_handoff_sessions
    SET status = 'failed', fail_reason = 'expired'
    WHERE id = p_session_id;
    RETURN json_build_object('ok', false, 'error', 'expired');
  END IF;

  IF _row.status = 'completed' THEN
    _trial := coalesce((_row.result->>'trial_eligible')::boolean, false);
    _match := coalesce((_row.result->>'facial_match')::boolean, false);
    RETURN json_build_object(
      'ok', true,
      'trial_eligible', _trial,
      'facial_match', _match,
      'already_completed', true
    );
  END IF;

  IF _row.status = 'consumed' THEN
    RETURN json_build_object('ok', true, 'already_completed', true);
  END IF;

  IF _row.status = 'failed' THEN
    IF _row.fail_reason = 'expired' THEN
      RETURN json_build_object('ok', false, 'error', 'expired');
    END IF;
    UPDATE public.facial_handoff_sessions
    SET status = 'claimed', fail_reason = NULL
    WHERE id = p_session_id;
    SELECT * INTO _row FROM public.facial_handoff_sessions WHERE id = p_session_id FOR UPDATE;
  END IF;

  IF _row.status = 'pending' THEN
    RETURN json_build_object('ok', false, 'error', 'not_claimed');
  END IF;

  IF _row.status <> 'claimed' THEN
    RETURN json_build_object('ok', false, 'error', 'session_busy');
  END IF;

  _check := public.check_facial_trial_eligibility(p_embedding);
  _trial := coalesce((_check->>'trial_eligible')::boolean, false);
  _match := coalesce((_check->>'facial_match')::boolean, false);

  IF (_check->>'error') IS NOT NULL THEN
    RETURN json_build_object('ok', false, 'error', 'invalid_embedding');
  END IF;

  UPDATE public.facial_handoff_sessions
  SET
    status = 'completed',
    completed_at = now(),
    fail_reason = NULL,
    result = jsonb_build_object(
      'embedding', to_jsonb(p_embedding),
      'trial_eligible', _trial,
      'facial_match', _match
    )
  WHERE id = p_session_id AND status = 'claimed';

  RETURN json_build_object(
    'ok', true,
    'trial_eligible', _trial,
    'facial_match', _match
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_facial_handoff_session(
  p_session_id uuid,
  p_embedding real[]
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.submit_facial_handoff_verification(p_session_id, p_embedding);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_facial_handoff_verification(uuid, real[]) TO anon, authenticated;
