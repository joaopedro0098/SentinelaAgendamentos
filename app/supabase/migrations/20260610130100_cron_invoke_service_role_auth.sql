-- Cron passa a usar service_role do Vault (Authorization Bearer) como fallback do x-cron-secret.

CREATE OR REPLACE FUNCTION public.invoke_process_appointment_reminders_cron()
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
    RAISE WARNING 'Vault sem reminder_cron_secret ou service_role_key; cron não invocou process-appointment-reminders.';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := 'https://zdmecbyyfubpmwrzzbqf.supabase.co/functions/v1/process-appointment-reminders',
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
