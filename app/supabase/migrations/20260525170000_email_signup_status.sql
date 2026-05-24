-- Status do e-mail no cadastro (para mensagens de login/cadastro mais claras).
CREATE OR REPLACE FUNCTION public.get_email_signup_status(check_email text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  confirmed_at timestamptz;
BEGIN
  SELECT email_confirmed_at
  INTO confirmed_at
  FROM auth.users
  WHERE lower(trim(email)) = lower(trim(check_email))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 'not_registered';
  END IF;

  IF confirmed_at IS NULL THEN
    RETURN 'pending_confirmation';
  END IF;

  RETURN 'registered';
END;
$$;

REVOKE ALL ON FUNCTION public.get_email_signup_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_email_signup_status(text) TO anon, authenticated;
