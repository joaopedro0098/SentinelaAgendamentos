-- Status da inscrição push do cliente para re-inscrição via hub público.

CREATE OR REPLACE FUNCTION public.get_client_confirmation_push_status(_slug text, _whatsapp text)
RETURNS TABLE (
  confirmation_token uuid,
  needs_resubscribe boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_id uuid;
  _digits text;
  _agendamento_id uuid;
  _confirmation_token uuid;
BEGIN
  _digits := regexp_replace(COALESCE(_whatsapp, ''), '\D', '', 'g');
  IF length(_digits) < 10 THEN
    RETURN;
  END IF;

  SELECT b.id INTO _barbearia_id
  FROM public.barbearias b
  WHERE b.slug = trim(_slug)
    AND b.ativa = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT a.id, a.confirmation_token
  INTO _agendamento_id, _confirmation_token
  FROM public.agendamentos a
  WHERE a.barbearia_id = _barbearia_id
    AND a.status = 'confirmado'::public.agendamento_status
    AND a.origem = 'link_publico'
    AND a.requires_client_confirmation = true
    AND a.client_confirmed_at IS NULL
    AND a.confirmation_push_sent_at IS NULL
    AND a.data >= (timezone('America/Sao_Paulo', now()))::date
    AND regexp_replace(a.cliente_whatsapp, '\D', '', 'g') = _digits
  ORDER BY a.data ASC, a.hora ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  confirmation_token := _confirmation_token;
  needs_resubscribe := NOT EXISTS (
    SELECT 1
    FROM public.appointment_push_subscriptions s
    WHERE s.agendamento_id = _agendamento_id
      AND s.failed_at IS NULL
  );

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_confirmation_push_status(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_client_confirmation_push_status(text, text) TO anon, authenticated;
