-- Meta WABA: dedupe atômico de webhooks, status de entrega, lease de cron (sem estado em memória cross-invocation).

-- =============================================================================
-- Dedupe de eventos webhook (INSERT ON CONFLICT — sem SELECT-then-INSERT)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_waba_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL,
  event_kind text NOT NULL,
  waba_id text,
  phone_number_id text,
  payload jsonb,
  processed_at timestamptz,
  process_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_waba_webhook_events_dedupe_key_unique UNIQUE (dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_waba_webhook_events_created_at
  ON public.whatsapp_waba_webhook_events (created_at DESC);

COMMENT ON TABLE public.whatsapp_waba_webhook_events IS
  'Eventos Meta (messages): dedupe atômica por dedupe_key (ex. inbound:wamid, status:wamid:sent).';

ALTER TABLE public.whatsapp_waba_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no public whatsapp waba webhook events" ON public.whatsapp_waba_webhook_events;
CREATE POLICY "no public whatsapp waba webhook events"
  ON public.whatsapp_waba_webhook_events
  FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.try_insert_waba_webhook_event(
  p_dedupe_key text,
  p_event_kind text,
  p_waba_id text DEFAULT NULL,
  p_phone_number_id text DEFAULT NULL,
  p_payload jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.whatsapp_waba_webhook_events (
    dedupe_key,
    event_kind,
    waba_id,
    phone_number_id,
    payload
  )
  VALUES (
    p_dedupe_key,
    p_event_kind,
    NULLIF(trim(p_waba_id), ''),
    NULLIF(trim(p_phone_number_id), ''),
    p_payload
  )
  ON CONFLICT (dedupe_key) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.try_insert_waba_webhook_event(text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_insert_waba_webhook_event(text, text, text, text, jsonb) TO service_role;

COMMENT ON FUNCTION public.try_insert_waba_webhook_event IS
  'Retorna id do evento inserido ou NULL se dedupe_key já existia (evento duplicado).';

CREATE OR REPLACE FUNCTION public.mark_waba_webhook_event_processed(
  p_event_id uuid,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.whatsapp_waba_webhook_events
  SET
    processed_at = now(),
    process_error = NULLIF(trim(p_error), '')
  WHERE id = p_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_waba_webhook_event_processed(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_waba_webhook_event_processed(uuid, text) TO service_role;

-- =============================================================================
-- Status de entrega Meta em mensagens outbound
-- =============================================================================

ALTER TABLE public.whatsapp_mensagens_enviadas
  ADD COLUMN IF NOT EXISTS meta_delivery_status text,
  ADD COLUMN IF NOT EXISTS meta_delivery_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS meta_delivery_error_code integer,
  ADD COLUMN IF NOT EXISTS meta_delivery_error_detail text;

ALTER TABLE public.whatsapp_mensagens_enviadas
  DROP CONSTRAINT IF EXISTS whatsapp_mensagens_enviadas_meta_delivery_status_check;

ALTER TABLE public.whatsapp_mensagens_enviadas
  ADD CONSTRAINT whatsapp_mensagens_enviadas_meta_delivery_status_check
  CHECK (
    meta_delivery_status IS NULL
    OR meta_delivery_status IN ('sent', 'delivered', 'read', 'failed')
  );

COMMENT ON COLUMN public.whatsapp_mensagens_enviadas.meta_delivery_status IS
  'Pipeline Meta (statuses webhook): sent, delivered, read, failed.';

CREATE INDEX IF NOT EXISTS idx_whatsapp_msg_meta_external_id
  ON public.whatsapp_mensagens_enviadas (external_message_id)
  WHERE provider = 'meta' AND external_message_id IS NOT NULL;

ALTER TABLE public.whatsapp_mensagens_enviadas
  DROP CONSTRAINT IF EXISTS whatsapp_mensagens_enviadas_tipo_check;

ALTER TABLE public.whatsapp_mensagens_enviadas
  ADD CONSTRAINT whatsapp_mensagens_enviadas_tipo_check
  CHECK (tipo IN ('lembrete_d1', 'lembrete_3h', 'alerta_profissional'));

-- =============================================================================
-- Lease de cron (substitui advisory lock entre round-trips HTTP do pooler)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cron_job_leases (
  job_name text PRIMARY KEY,
  leased_until timestamptz NOT NULL,
  leased_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cron_job_leases IS
  'Lease por job_name para evitar crons sobrepostos (Edge Functions stateless).';

ALTER TABLE public.cron_job_leases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no public cron job leases" ON public.cron_job_leases;
CREATE POLICY "no public cron job leases"
  ON public.cron_job_leases
  FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.try_acquire_cron_job_lease(
  p_job_name text,
  p_lease_seconds integer DEFAULT 900
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_until timestamptz := now() + make_interval(secs => GREATEST(p_lease_seconds, 30));
  v_inserted boolean;
BEGIN
  UPDATE public.cron_job_leases
  SET leased_until = v_until, leased_at = v_now
  WHERE job_name = p_job_name
    AND leased_until <= v_now;

  IF FOUND THEN
    RETURN true;
  END IF;

  INSERT INTO public.cron_job_leases (job_name, leased_until, leased_at)
  VALUES (p_job_name, v_until, v_now)
  ON CONFLICT (job_name) DO NOTHING
  RETURNING true INTO v_inserted;

  RETURN coalesce(v_inserted, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_cron_job_lease(p_job_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.cron_job_leases
  SET leased_until = now()
  WHERE job_name = p_job_name;
END;
$$;

REVOKE ALL ON FUNCTION public.try_acquire_cron_job_lease(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_acquire_cron_job_lease(text, integer) TO service_role;

REVOKE ALL ON FUNCTION public.release_cron_job_lease(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_cron_job_lease(text) TO service_role;
