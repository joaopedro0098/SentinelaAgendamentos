-- Cron: retenta smb_app_data (coexistência) para lojas dentro da janela 24h pós-conexão.

CREATE OR REPLACE FUNCTION public.invoke_poll_waba_coex_smb_sync_cron()
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
    RAISE WARNING 'Vault sem reminder_cron_secret ou service_role_key; cron não invocou poll-waba-coex-smb-sync.';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := 'https://zdmecbyyfubpmwrzzbqf.supabase.co/functions/v1/poll-waba-coex-smb-sync',
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
    body := '{}'::jsonb
  )
  INTO _request_id;

  RETURN _request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_poll_waba_coex_smb_sync_cron() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_poll_waba_coex_smb_sync_cron() TO postgres;

COMMENT ON FUNCTION public.invoke_poll_waba_coex_smb_sync_cron() IS
  'Invoca poll-waba-coex-smb-sync (pg_cron, a cada 15 min).';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('poll-waba-coex-smb-sync');
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      'poll-waba-coex-smb-sync',
      '*/15 * * * *',
      'SELECT public.invoke_poll_waba_coex_smb_sync_cron();'
    );

    RAISE NOTICE 'Cron poll-waba-coex-smb-sync agendado (a cada 15 minutos).';
  ELSE
    RAISE NOTICE 'pg_cron indisponível; agende poll-waba-coex-smb-sync externamente.';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Falha ao agendar cron poll-waba-coex-smb-sync: %', SQLERRM;
END;
$$;
