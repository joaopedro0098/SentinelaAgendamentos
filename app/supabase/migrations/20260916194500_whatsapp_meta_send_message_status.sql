-- Resposta síncrona do POST /messages (message_status), distinto do pipeline meta_delivery_* (webhook statuses).

ALTER TABLE public.whatsapp_mensagens_enviadas
  ADD COLUMN IF NOT EXISTS meta_send_message_status text;

ALTER TABLE public.whatsapp_mensagens_enviadas
  DROP CONSTRAINT IF EXISTS whatsapp_mensagens_enviadas_meta_send_message_status_check;

ALTER TABLE public.whatsapp_mensagens_enviadas
  ADD CONSTRAINT whatsapp_mensagens_enviadas_meta_send_message_status_check
  CHECK (
    meta_send_message_status IS NULL
    OR meta_send_message_status IN ('accepted', 'held_for_quality_assessment')
  );

COMMENT ON COLUMN public.whatsapp_mensagens_enviadas.meta_send_message_status IS
  'message_status da resposta POST Meta (accepted | held_for_quality_assessment). Distinto de meta_delivery_status (webhook).';
