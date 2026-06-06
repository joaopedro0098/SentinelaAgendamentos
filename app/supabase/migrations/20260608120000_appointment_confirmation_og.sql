-- Metadados públicos (OG / preview WhatsApp) por token de confirmação.

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
    bb.nome AS shop_name,
    NULLIF(trim(bb.logo_url), '') AS shop_logo_url,
    a.cliente_nome,
    a.data,
    a.hora
  INTO _row
  FROM public.agendamentos a
  JOIN public.barbearias bb ON bb.id = a.barbearia_id
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

GRANT EXECUTE ON FUNCTION public.get_appointment_confirmation_og(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_appointment_confirmation_og(uuid) IS
  'Dados públicos para preview de link (WhatsApp/OG) da página de confirmação de agendamento.';
