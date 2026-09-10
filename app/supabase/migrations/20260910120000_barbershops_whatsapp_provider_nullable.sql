-- Permite NULL em whatsapp_messaging_provider após disconnect (sem BSP ativo).
-- DEFAULT 'twilio' mantido para INSERTs legados que omitirem a coluna (Opção A).

ALTER TABLE public.barbershops
  ALTER COLUMN whatsapp_messaging_provider DROP NOT NULL;

COMMENT ON COLUMN public.barbershops.whatsapp_messaging_provider IS
  'BSP ativo para envio/recebimento (twilio, infobip, meta). NULL = sem provider ativo.';
