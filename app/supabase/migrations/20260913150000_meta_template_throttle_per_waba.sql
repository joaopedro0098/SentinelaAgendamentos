-- Ambientes que aplicaram a versão global (barbershop_id) da migration anterior.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'meta_waba_template_creation_events'
      AND column_name = 'barbershop_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'meta_waba_template_creation_events'
      AND column_name = 'waba_id'
  ) THEN
    DROP TABLE public.meta_waba_template_creation_events;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.meta_waba_template_creation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  waba_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_waba_template_creation_events_waba_created
  ON public.meta_waba_template_creation_events (waba_id, created_at DESC);

ALTER TABLE public.meta_waba_template_creation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no public meta waba template creation events"
  ON public.meta_waba_template_creation_events;
CREATE POLICY "no public meta waba template creation events"
  ON public.meta_waba_template_creation_events
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.meta_waba_template_creation_events IS
  'Registro de POST message_templates bem-sucedidos por WABA (throttle 10/h por waba_id).';
