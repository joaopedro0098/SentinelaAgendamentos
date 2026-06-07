-- Cron diário: push de confirmação do cliente 1 dia antes (~10h America/Sao_Paulo = 13:00 UTC).
-- Requer extensões pg_cron, pg_net e vault (habilitar no Dashboard se a migration avisar).

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron: habilite em Database → Extensions no Supabase Dashboard.';
END;
$$;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_net: habilite em Database → Extensions no Supabase Dashboard.';
END;
$$;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'supabase_vault: habilite em Database → Extensions no Supabase Dashboard.';
END;
$$;

CREATE OR REPLACE FUNCTION public.invoke_process_appointment_reminders_cron()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  _secret text;
  _request_id bigint;
BEGIN
  SELECT decrypted_secret
  INTO _secret
  FROM vault.decrypted_secrets
  WHERE name = 'reminder_cron_secret'
  LIMIT 1;

  IF _secret IS NULL OR length(trim(_secret)) = 0 THEN
    RAISE WARNING 'reminder_cron_secret ausente no Vault; cron não invocou process-appointment-reminders.';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := 'https://zdmecbyyfubpmwrzzbqf.supabase.co/functions/v1/process-appointment-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', trim(_secret)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
  INTO _request_id;

  RETURN _request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_process_appointment_reminders_cron() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_process_appointment_reminders_cron() TO postgres;

COMMENT ON FUNCTION public.invoke_process_appointment_reminders_cron() IS
  'Invoca a Edge Function process-appointment-reminders (uso interno do pg_cron).';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('process-appointment-reminders-daily');
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      'process-appointment-reminders-daily',
      '0 13 * * *',
      'SELECT public.invoke_process_appointment_reminders_cron();'
    );

    RAISE NOTICE 'Cron process-appointment-reminders-daily agendado (13:00 UTC = 10:00 America/Sao_Paulo).';
  ELSE
    RAISE NOTICE 'pg_cron indisponível; agende a Edge Function externamente às 10h SP.';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Falha ao agendar cron: %', SQLERRM;
END;
$$;
