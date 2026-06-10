-- Herda inscrição push de agendamento anterior do mesmo cliente (ex.: painel do barbeiro).

CREATE OR REPLACE FUNCTION public.whatsapp_match_digits(a text, b text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  WITH
    da AS (
      SELECT regexp_replace(COALESCE(a, ''), '\D', '', 'g') AS v
    ),
    db AS (
      SELECT regexp_replace(COALESCE(b, ''), '\D', '', 'g') AS v
    )
  SELECT
    (SELECT v FROM da) = (SELECT v FROM db)
    OR (
      length((SELECT v FROM da)) >= 10
      AND length((SELECT v FROM db)) >= 10
      AND right((SELECT v FROM da), 11) = right((SELECT v FROM db), 11)
    );
$$;

CREATE OR REPLACE FUNCTION public.inherit_appointment_push_subscription(_agendamento_id uuid)
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

  IF EXISTS (
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
  ORDER BY s.created_at DESC
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

CREATE OR REPLACE FUNCTION public.trg_inherit_appointment_push_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'confirmado'::public.agendamento_status
     AND NEW.requires_client_confirmation = true
     AND NEW.cliente_whatsapp IS NOT NULL
  THEN
    PERFORM public.inherit_appointment_push_subscription(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inherit_push_subscription_on_agendamento ON public.agendamentos;

CREATE TRIGGER inherit_push_subscription_on_agendamento
  AFTER INSERT ON public.agendamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_inherit_appointment_push_subscription();

GRANT EXECUTE ON FUNCTION public.inherit_appointment_push_subscription(uuid) TO service_role;

COMMENT ON FUNCTION public.inherit_appointment_push_subscription(uuid) IS
  'Copia inscrição push válida de outro agendamento do mesmo cliente na mesma barbearia.';

-- Alinha RPC do hub com painel + comparação flexível de WhatsApp (mesma lógica da herança).
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
    AND a.requires_client_confirmation = true
    AND a.client_confirmed_at IS NULL
    AND a.confirmation_push_sent_at IS NULL
    AND a.data >= (timezone('America/Sao_Paulo', now()))::date
    AND public.whatsapp_match_digits(a.cliente_whatsapp, _digits)
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
