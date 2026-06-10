-- Painel: permite atualizar inscrição herdada e prioriza subscription com entrega bem-sucedida.

CREATE OR REPLACE FUNCTION public.inherit_appointment_push_subscription(
  _agendamento_id uuid,
  _force_refresh boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_id uuid;
  _whatsapp text;
  _source record;
BEGIN
  SELECT a.barbearia_id, a.cliente_whatsapp
  INTO _barbearia_id, _whatsapp
  FROM public.agendamentos a
  WHERE a.id = _agendamento_id;

  IF NOT FOUND OR _whatsapp IS NULL THEN
    RETURN false;
  END IF;

  IF NOT _force_refresh AND EXISTS (
    SELECT 1
    FROM public.appointment_push_subscriptions s
    WHERE s.agendamento_id = _agendamento_id
      AND s.failed_at IS NULL
  ) THEN
    RETURN false;
  END IF;

  SELECT s.endpoint, s.p256dh, s.auth
  INTO _source
  FROM public.appointment_push_subscriptions s
  INNER JOIN public.agendamentos a ON a.id = s.agendamento_id
  WHERE a.barbearia_id = _barbearia_id
    AND a.id <> _agendamento_id
    AND public.whatsapp_match_digits(a.cliente_whatsapp, _whatsapp)
    AND s.failed_at IS NULL
  ORDER BY s.last_success_at DESC NULLS LAST, s.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.appointment_push_subscriptions (
    agendamento_id,
    endpoint,
    p256dh,
    auth,
    failed_at,
    failure_reason
  )
  VALUES (_agendamento_id, _source.endpoint, _source.p256dh, _source.auth, NULL, NULL)
  ON CONFLICT (agendamento_id, endpoint)
  DO UPDATE SET
    p256dh = EXCLUDED.p256dh,
    auth = EXCLUDED.auth,
    failed_at = NULL,
    failure_reason = NULL;

  RETURN true;
END;
$$;
