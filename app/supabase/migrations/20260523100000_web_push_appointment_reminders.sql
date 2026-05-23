-- Web Push: confirmação 1 dia antes e lembrete 3h antes do agendamento.

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS requires_client_confirmation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmation_token uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS client_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_push_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_push_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS agendamentos_confirmation_token_key
  ON public.agendamentos (confirmation_token);

-- Um horário cancelado precisa voltar a ficar disponível.
ALTER TABLE public.agendamentos
  DROP CONSTRAINT IF EXISTS agendamentos_barbeiro_id_data_hora_key;

CREATE UNIQUE INDEX IF NOT EXISTS agendamentos_barbeiro_data_hora_confirmado_key
  ON public.agendamentos (barbeiro_id, data, hora)
  WHERE status = 'confirmado';

CREATE TABLE IF NOT EXISTS public.appointment_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id uuid NOT NULL REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  UNIQUE (agendamento_id, endpoint)
);

ALTER TABLE public.appointment_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- A tabela é manipulada por Edge Functions com service role.
DROP POLICY IF EXISTS "no public access appointment push subscriptions" ON public.appointment_push_subscriptions;
CREATE POLICY "no public access appointment push subscriptions"
  ON public.appointment_push_subscriptions
  FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.cancel_unconfirmed_appointments()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer;
BEGIN
  UPDATE public.agendamentos
  SET
    status = 'cancelado',
    cancel_reason = 'Não confirmado pelo cliente no dia anterior'
  WHERE status = 'confirmado'
    AND requires_client_confirmation = true
    AND confirmation_push_sent_at IS NOT NULL
    AND client_confirmed_at IS NULL
    AND data <= CURRENT_DATE;

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_unconfirmed_appointments() TO service_role;
