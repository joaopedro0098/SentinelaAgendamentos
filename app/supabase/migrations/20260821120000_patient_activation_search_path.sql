-- pgcrypto (gen_random_bytes) lives in extensions schema; search_path = public alone breaks token generation.

ALTER FUNCTION public.get_or_create_patient_activation_link(text)
  SET search_path = public, extensions;

ALTER FUNCTION public.create_patient_activation_token(uuid)
  SET search_path = public, extensions;
