-- Handoff QR: reconhecimento facial no cadastro (sessão efêmera, anon).

CREATE TABLE IF NOT EXISTS public.facial_handoff_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watch_token text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'completed', 'failed', 'consumed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  completed_at timestamptz,
  consumed_at timestamptz,
  result jsonb,
  fail_reason text
);

CREATE INDEX IF NOT EXISTS idx_facial_handoff_sessions_expires
  ON public.facial_handoff_sessions (expires_at)
  WHERE status IN ('pending', 'claimed');

ALTER TABLE public.facial_handoff_sessions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.facial_handoff_sessions IS
  'Sessões efêmeras para verificação facial via QR no cadastro (sem login).';

CREATE OR REPLACE FUNCTION public.create_facial_handoff_session()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _watch text;
  _expires timestamptz;
BEGIN
  _watch := encode(gen_random_bytes(32), 'hex');
  _expires := now() + interval '10 minutes';

  INSERT INTO public.facial_handoff_sessions (watch_token, expires_at)
  VALUES (_watch, _expires)
  RETURNING id INTO _id;

  RETURN json_build_object(
    'session_id', _id,
    'expires_at', _expires,
    'watch_token', _watch
  );
END;
$$;

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
    WHERE id = p_session_id AND status = 'pending';
    RETURN json_build_object('ok', false, 'error', 'expired');
  END IF;

  IF _row.status <> 'pending' THEN
    IF _row.status IN ('claimed', 'completed', 'consumed') THEN
      RETURN json_build_object('ok', false, 'error', 'already_claimed');
    END IF;
    RETURN json_build_object('ok', false, 'error', 'expired');
  END IF;

  UPDATE public.facial_handoff_sessions
  SET status = 'claimed', claimed_at = now()
  WHERE id = p_session_id
    AND status = 'pending'
    AND expires_at > now();

  GET DIAGNOSTICS _updated = ROW_COUNT;
  IF _updated = 0 THEN
    RETURN json_build_object('ok', false, 'error', 'already_claimed');
  END IF;

  SELECT expires_at INTO _expires FROM public.facial_handoff_sessions WHERE id = p_session_id;

  RETURN json_build_object('ok', true, 'expires_at', _expires);
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_facial_handoff_result(p_session_id uuid, p_watch_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.facial_handoff_sessions%ROWTYPE;
  _result jsonb;
BEGIN
  IF p_session_id IS NULL OR p_watch_token IS NULL OR length(trim(p_watch_token)) = 0 THEN
    RETURN json_build_object('ready', false, 'error', 'invalid_request');
  END IF;

  SELECT * INTO _row
  FROM public.facial_handoff_sessions
  WHERE id = p_session_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ready', false, 'error', 'not_found');
  END IF;

  IF _row.watch_token <> p_watch_token THEN
    RETURN json_build_object('ready', false, 'error', 'forbidden');
  END IF;

  IF _row.expires_at <= now() AND _row.status NOT IN ('completed', 'consumed') THEN
    RETURN json_build_object('ready', false, 'error', 'expired');
  END IF;

  IF _row.status = 'failed' THEN
    RETURN json_build_object(
      'ready', true,
      'status', 'failed',
      'error', coalesce(_row.fail_reason, 'failed')
    );
  END IF;

  IF _row.status IN ('pending', 'claimed') THEN
    RETURN json_build_object('ready', false, 'status', _row.status);
  END IF;

  IF _row.status = 'consumed' THEN
    RETURN json_build_object('ready', false, 'error', 'already_consumed');
  END IF;

  IF _row.status = 'completed' THEN
    _result := _row.result;
    UPDATE public.facial_handoff_sessions
    SET status = 'consumed', consumed_at = now(), result = NULL
    WHERE id = p_session_id AND status = 'completed';

    RETURN json_build_object(
      'ready', true,
      'status', 'completed',
      'result', _result
    );
  END IF;

  RETURN json_build_object('ready', false, 'error', 'unknown');
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

  IF _row.status <> 'claimed' THEN
    IF _row.status = 'pending' THEN
      RETURN json_build_object('ok', false, 'error', 'not_claimed');
    END IF;
    RETURN json_build_object('ok', false, 'error', 'already_claimed');
  END IF;

  _check := public.check_facial_trial_eligibility(p_embedding);
  _trial := coalesce((_check->>'trial_eligible')::boolean, false);
  _match := coalesce((_check->>'facial_match')::boolean, false);

  IF (_check->>'error') IS NOT NULL THEN
    UPDATE public.facial_handoff_sessions
    SET status = 'failed', fail_reason = 'invalid_embedding', completed_at = now()
    WHERE id = p_session_id;
    RETURN json_build_object('ok', false, 'error', 'invalid_embedding');
  END IF;

  UPDATE public.facial_handoff_sessions
  SET
    status = 'completed',
    completed_at = now(),
    result = jsonb_build_object(
      'embedding', to_jsonb(p_embedding),
      'trial_eligible', _trial,
      'facial_match', _match
    )
  WHERE id = p_session_id;

  RETURN json_build_object(
    'ok', true,
    'trial_eligible', _trial,
    'facial_match', _match
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_facial_handoff_session() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_facial_handoff_session(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_facial_handoff_result(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_facial_handoff_session(uuid, real[]) TO service_role;
