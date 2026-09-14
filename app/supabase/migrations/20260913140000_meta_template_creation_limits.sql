-- Auditoria de criações Meta (throttle global Sentinela: 10/hora).

CREATE TABLE IF NOT EXISTS public.meta_waba_template_creation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id uuid NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_waba_template_creation_events_created_at
  ON public.meta_waba_template_creation_events (created_at DESC);

ALTER TABLE public.meta_waba_template_creation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no public meta waba template creation events"
  ON public.meta_waba_template_creation_events;
CREATE POLICY "no public meta waba template creation events"
  ON public.meta_waba_template_creation_events
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.meta_waba_template_creation_events IS
  'Registro de POST message_templates bem-sucedidos (throttle interno Sentinela).';
