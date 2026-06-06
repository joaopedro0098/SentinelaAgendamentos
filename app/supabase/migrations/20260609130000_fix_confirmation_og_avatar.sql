-- OG/WhatsApp: foto de perfil (barbershops.avatar_url) + logo_url da barbearia.

UPDATE public.barbearias b
SET logo_url = s.avatar_url
FROM public.barbershops s
WHERE s.slug = b.slug
  AND s.avatar_url IS NOT NULL
  AND trim(s.avatar_url) <> ''
  AND (b.logo_url IS NULL OR trim(b.logo_url) = '');

CREATE OR REPLACE FUNCTION public.get_appointment_confirmation_og(p_token uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row record;
BEGIN
  IF p_token IS NULL THEN
    RETURN json_build_object('error', 'invalid_token');
  END IF;

  SELECT
    COALESCE(NULLIF(trim(bb.nome), ''), NULLIF(trim(s.display_name), ''), 'Agendamento') AS shop_name,
    NULLIF(
      trim(COALESCE(NULLIF(trim(bb.logo_url), ''), NULLIF(trim(s.avatar_url), ''))),
      ''
    ) AS shop_logo_url,
    a.cliente_nome,
    a.data,
    a.hora
  INTO _row
  FROM public.agendamentos a
  JOIN public.barbearias bb ON bb.id = a.barbearia_id
  JOIN public.barbershops s ON s.slug = bb.slug
  WHERE a.confirmation_token = p_token
    AND a.status = 'confirmado'::public.agendamento_status
    AND public.agendamento_dentro_retencao(a.data)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  RETURN json_build_object(
    'shop_name', _row.shop_name,
    'shop_logo_url', _row.shop_logo_url,
    'cliente_nome', _row.cliente_nome,
    'data', _row.data,
    'hora', _row.hora
  );
END;
$$;
