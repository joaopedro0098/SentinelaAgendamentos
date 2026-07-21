-- gen_random_bytes vive em extensions (pgcrypto); search_path só em public quebrava create_facial_handoff_session.

CREATE OR REPLACE FUNCTION public.create_facial_handoff_session()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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
