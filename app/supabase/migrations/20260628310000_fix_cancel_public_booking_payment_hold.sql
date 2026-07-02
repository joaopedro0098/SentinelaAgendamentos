-- Cancelamento pelo cliente no link público: idempotente + cancelado_por correto.

CREATE OR REPLACE FUNCTION public.cancel_public_booking_payment_hold(
  p_agendamento_id uuid,
  p_confirmation_token uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _status public.agendamento_status;
BEGIN
  SELECT a.status
  INTO _status
  FROM public.agendamentos a
  WHERE a.id = p_agendamento_id
    AND a.confirmation_token = p_confirmation_token;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  IF _status = 'cancelado'::public.agendamento_status THEN
    RETURN json_build_object('ok', true, 'already_cancelled', true);
  END IF;

  IF _status <> 'aguardando_pagamento'::public.agendamento_status THEN
    RETURN json_build_object('error', 'invalid_status', 'status', _status::text);
  END IF;

  UPDATE public.agendamentos
  SET
    status = 'cancelado'::public.agendamento_status,
    payment_status = 'cancelled'::public.appointment_payment_status,
    payment_expires_at = NULL,
    cancelado_por = 'cliente'
  WHERE id = p_agendamento_id
    AND confirmation_token = p_confirmation_token
    AND status = 'aguardando_pagamento'::public.agendamento_status;

  RETURN json_build_object('ok', true);
END;
$$;
