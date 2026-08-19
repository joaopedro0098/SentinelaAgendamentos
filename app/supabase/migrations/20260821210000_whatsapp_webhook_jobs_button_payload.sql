-- ButtonPayload do quick reply Twilio (ex.: confirmar<uuid>); jobs antigos permanecem NULL.

ALTER TABLE public.whatsapp_webhook_jobs
  ADD COLUMN IF NOT EXISTS button_payload text;

COMMENT ON COLUMN public.whatsapp_webhook_jobs.button_payload IS
  'ButtonPayload recebido no webhook Twilio (quick reply). NULL em jobs enfileirados antes da Parte D.';
