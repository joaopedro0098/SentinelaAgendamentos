-- WhatsApp de suporte da plataforma (admin configura; barbeiros abrem via wa.me).

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS support_whatsapp text;

COMMENT ON COLUMN public.platform_settings.support_whatsapp IS
  'WhatsApp do suporte Sentinela (somente dígitos). Barbeiros abrem via wa.me no menu Suporte.';

CREATE OR REPLACE FUNCTION public.get_support_whatsapp()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(trim(support_whatsapp), '')
  FROM public.platform_settings
  WHERE id = 1;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_support_whatsapp()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NULL;
  END IF;

  RETURN public.get_support_whatsapp();
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_support_whatsapp(p_whatsapp text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _digits text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  _digits := regexp_replace(COALESCE(p_whatsapp, ''), '\D', '', 'g');

  IF _digits = '' THEN
    UPDATE public.platform_settings
    SET support_whatsapp = NULL, updated_at = now()
    WHERE id = 1;
    RETURN json_build_object('ok', true, 'support_whatsapp', NULL);
  END IF;

  IF char_length(_digits) < 10 OR char_length(_digits) > 15 THEN
    RETURN json_build_object('error', 'invalid_phone');
  END IF;

  UPDATE public.platform_settings
  SET support_whatsapp = _digits, updated_at = now()
  WHERE id = 1;

  RETURN json_build_object('ok', true, 'support_whatsapp', _digits);
END;
$$;

REVOKE ALL ON FUNCTION public.get_support_whatsapp() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_support_whatsapp() TO authenticated;

REVOKE ALL ON FUNCTION public.admin_get_support_whatsapp() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_support_whatsapp() TO authenticated;

REVOKE ALL ON FUNCTION public.admin_set_support_whatsapp(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_support_whatsapp(text) TO authenticated;
