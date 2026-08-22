-- Suporte multi-provider WhatsApp (Twilio + Infobip).
-- IMPORTANTE: deploy atômico com Edge Functions que usam inbound_message_id / external_message_id.

DO $$ BEGIN
  CREATE TYPE public.whatsapp_messaging_provider AS ENUM ('twilio', 'infobip');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- barbershops — provider por tenant
-- =============================================================================

ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS whatsapp_messaging_provider public.whatsapp_messaging_provider
    NOT NULL DEFAULT 'twilio';

ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS infobip_sender_number text,
  ADD COLUMN IF NOT EXISTS infobip_api_key_encrypted text;

COMMENT ON COLUMN public.barbershops.whatsapp_messaging_provider IS
  'BSP ativo para envio/recebimento operacional desta barbearia (lembretes, alertas).';

CREATE INDEX IF NOT EXISTS idx_barbershops_whatsapp_provider
  ON public.barbershops (whatsapp_messaging_provider);

-- =============================================================================
-- whatsapp_webhook_jobs
-- =============================================================================

ALTER TABLE public.whatsapp_webhook_jobs
  ADD COLUMN IF NOT EXISTS provider public.whatsapp_messaging_provider
    NOT NULL DEFAULT 'twilio';

ALTER TABLE public.whatsapp_webhook_jobs
  RENAME COLUMN inbound_message_sid TO inbound_message_id;

ALTER TABLE public.whatsapp_webhook_jobs
  DROP CONSTRAINT IF EXISTS whatsapp_webhook_jobs_inbound_message_sid_key;

ALTER TABLE public.whatsapp_webhook_jobs
  ADD CONSTRAINT whatsapp_webhook_jobs_provider_inbound_message_id_key
    UNIQUE (provider, inbound_message_id);

COMMENT ON COLUMN public.whatsapp_webhook_jobs.inbound_message_id IS
  'ID externo da mensagem RECEBIDA (Twilio MessageSid ou Infobip messageId). Idempotência junto com provider.';

COMMENT ON COLUMN public.whatsapp_webhook_jobs.provider IS
  'BSP que originou este webhook (twilio | infobip).';

COMMENT ON TABLE public.whatsapp_webhook_jobs IS
  'Fila de jobs para processar respostas de pacientes via webhook WhatsApp (Twilio ou Infobip). '
  'inbound_message_id + provider é a chave de idempotência.';

-- =============================================================================
-- whatsapp_mensagens_enviadas
-- =============================================================================

ALTER TABLE public.whatsapp_mensagens_enviadas
  ADD COLUMN IF NOT EXISTS provider public.whatsapp_messaging_provider
    NOT NULL DEFAULT 'twilio';

ALTER TABLE public.whatsapp_mensagens_enviadas
  RENAME COLUMN twilio_message_sid TO external_message_id;

COMMENT ON COLUMN public.whatsapp_mensagens_enviadas.external_message_id IS
  'ID externo da mensagem ENVIADA (Twilio SID ou Infobip messageId).';

CREATE INDEX IF NOT EXISTS idx_whatsapp_msg_provider_telefone_status
  ON public.whatsapp_mensagens_enviadas (provider, telefone, status, enviado_em DESC);

-- =============================================================================
-- alertas_agendamento
-- =============================================================================

ALTER TABLE public.alertas_agendamento
  ADD COLUMN IF NOT EXISTS provider public.whatsapp_messaging_provider
    NOT NULL DEFAULT 'twilio';

ALTER TABLE public.alertas_agendamento
  RENAME COLUMN twilio_message_sid TO external_message_id;

COMMENT ON COLUMN public.alertas_agendamento.external_message_id IS
  'ID externo da mensagem de alerta enviada ao profissional.';

-- =============================================================================
-- whatsapp_usage_log + RPC registrar_uso_mensageria
-- =============================================================================

ALTER TABLE public.whatsapp_usage_log
  ADD COLUMN IF NOT EXISTS provider public.whatsapp_messaging_provider
    NOT NULL DEFAULT 'twilio';

ALTER TABLE public.whatsapp_usage_log
  RENAME COLUMN twilio_message_sid TO external_message_id;

DROP FUNCTION IF EXISTS public.registrar_uso_mensageria(uuid, text, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.registrar_uso_mensageria(
  p_barbearia_id uuid,
  p_tipo text,
  p_profissional_id uuid DEFAULT NULL,
  p_agendamento_id uuid DEFAULT NULL,
  p_external_message_id text DEFAULT NULL,
  p_provider public.whatsapp_messaging_provider DEFAULT 'twilio'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  INSERT INTO public.whatsapp_usage_log (
    barbearia_id, profissional_id, agendamento_id, tipo,
    external_message_id, provider
  )
  VALUES (
    p_barbearia_id, p_profissional_id, p_agendamento_id, p_tipo,
    p_external_message_id, p_provider
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_uso_mensageria(uuid, text, uuid, uuid, text, public.whatsapp_messaging_provider) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_uso_mensageria(uuid, text, uuid, uuid, text, public.whatsapp_messaging_provider) TO service_role;

COMMENT ON FUNCTION public.registrar_uso_mensageria IS
  'Registra uso de mensageria WhatsApp (lembrete D-1, lembrete 3h, alerta profissional) para billing futuro.';

-- Admin RPC: expor provider nos jobs falhos (opcional, útil para debug multi-BSP)
CREATE OR REPLACE FUNCTION public.admin_list_failed_whatsapp_webhook_jobs(p_limit int DEFAULT 100)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _limit int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  _limit := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);

  RETURN (
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.processed_at DESC NULLS LAST, t.created_at DESC), '[]'::json)
    FROM (
      SELECT
        j.id,
        j.provider,
        j.telefone,
        j.body AS resposta,
        j.button_payload,
        j.last_error,
        j.attempts,
        j.max_attempts,
        j.created_at,
        j.processed_at
      FROM public.whatsapp_webhook_jobs j
      WHERE j.status = 'failed'
      ORDER BY j.processed_at DESC NULLS LAST, j.created_at DESC
      LIMIT _limit
    ) t
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_failed_whatsapp_webhook_jobs(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_failed_whatsapp_webhook_jobs(int) TO authenticated;
