-- Verifica se o e-mail já existe em auth.users (login: "e-mail não cadastrado").
CREATE OR REPLACE FUNCTION public.is_email_registered(check_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE lower(trim(email)) = lower(trim(check_email))
  );
$$;

REVOKE ALL ON FUNCTION public.is_email_registered(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_email_registered(text) TO anon, authenticated;
