-- Fila assíncrona para processamento de respostas WhatsApp (webhook Twilio).
-- O endpoint twilio-whatsapp-webhook só enfileira; um worker (pg_cron 1 min) consome.

CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inbound_message_sid text NOT NULL,
  telefone text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  processed_at timestamptz,
  CONSTRAINT whatsapp_webhook_jobs_inbound_message_sid_key UNIQUE (inbound_message_sid)
);

COMMENT ON TABLE public.whatsapp_webhook_jobs IS
  'Fila de jobs para processar respostas de pacientes via webhook Twilio. '
  'inbound_message_sid é a chave de idempotência (MessageSid da mensagem RECEBIDA).';

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_jobs_pending
  ON public.whatsapp_webhook_jobs (created_at)
  WHERE status = 'pending';

ALTER TABLE public.whatsapp_webhook_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no public whatsapp webhook jobs" ON public.whatsapp_webhook_jobs;
CREATE POLICY "no public whatsapp webhook jobs"
  ON public.whatsapp_webhook_jobs FOR ALL USING (false) WITH CHECK (false);

-- Índice em whatsapp_mensagens_enviadas já existe (telefone, status, enviado_em DESC)
-- na migration 20260714210000 — não recriar aqui.

-- Worker: invoca process-whatsapp-webhook-jobs a cada 1 minuto (mesmo padrão de auth do cron de lembretes).
CREATE OR REPLACE FUNCTION public.invoke_process_whatsapp_webhook_jobs_cron()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  _cron_secret text;
  _service_role text;
  _auth_header text;
  _request_id bigint;
BEGIN
  SELECT decrypted_secret
  INTO _cron_secret
  FROM vault.decrypted_secrets
  WHERE name = 'reminder_cron_secret'
  LIMIT 1;

  SELECT decrypted_secret
  INTO _service_role
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF _cron_secret IS NOT NULL AND length(trim(_cron_secret)) > 0 THEN
    _auth_header := NULL;
  ELSIF _service_role IS NOT NULL AND length(trim(_service_role)) > 0 THEN
    _auth_header := 'Bearer ' || trim(_service_role);
  ELSE
    RAISE WARNING 'Vault sem reminder_cron_secret ou service_role_key; cron não invocou process-whatsapp-webhook-jobs.';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := 'https://zdmecbyyfubpmwrzzbqf.supabase.co/functions/v1/process-whatsapp-webhook-jobs',
    headers := CASE
      WHEN _auth_header IS NOT NULL THEN jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', _auth_header
      )
      ELSE jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', trim(_cron_secret)
      )
    END,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
  INTO _request_id;

  RETURN _request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_process_whatsapp_webhook_jobs_cron() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_process_whatsapp_webhook_jobs_cron() TO postgres;

COMMENT ON FUNCTION public.invoke_process_whatsapp_webhook_jobs_cron() IS
  'Invoca a Edge Function process-whatsapp-webhook-jobs (uso interno do pg_cron, a cada 1 min).';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('process-whatsapp-webhook-jobs');
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      'process-whatsapp-webhook-jobs',
      '* * * * *',
      'SELECT public.invoke_process_whatsapp_webhook_jobs_cron();'
    );

    RAISE NOTICE 'Cron process-whatsapp-webhook-jobs agendado (a cada 1 minuto).';
  ELSE
    RAISE NOTICE 'pg_cron indisponível; agende process-whatsapp-webhook-jobs externamente.';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Falha ao agendar cron whatsapp webhook jobs: %', SQLERRM;
END;
$$;
