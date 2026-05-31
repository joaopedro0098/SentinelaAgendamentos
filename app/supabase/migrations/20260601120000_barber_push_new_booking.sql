-- Push para o barbeiro quando um cliente agenda pelo link público.

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'link_publico',
  ADD COLUMN IF NOT EXISTS barber_new_booking_push_sent_at timestamptz;

ALTER TABLE public.agendamentos
  DROP CONSTRAINT IF EXISTS agendamentos_origem_check;

ALTER TABLE public.agendamentos
  ADD CONSTRAINT agendamentos_origem_check
  CHECK (origem IN ('link_publico', 'painel'));

COMMENT ON COLUMN public.agendamentos.origem IS
  'link_publico = cliente pelo /agendar/:slug; painel = barbeiro no /app/agendar';

CREATE TABLE IF NOT EXISTS public.barber_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  UNIQUE (barbearia_id, endpoint)
);

CREATE INDEX IF NOT EXISTS barber_push_subscriptions_barbearia_id_idx
  ON public.barber_push_subscriptions (barbearia_id);

ALTER TABLE public.barber_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no public access barber push subscriptions" ON public.barber_push_subscriptions;
CREATE POLICY "no public access barber push subscriptions"
  ON public.barber_push_subscriptions
  FOR ALL
  USING (false)
  WITH CHECK (false);
