-- ============================================================================
-- Migration: WABA (WhatsApp Business API via Twilio BSP + Meta Webhook)
-- Descrição: Estrutura para suporte a WABA por barbearia via subcontas Twilio,
--            registro de Senders e recebimento de webhooks diretos da Meta.
-- ============================================================================

-- 1. Enum de status de conexão WABA
DO $$ BEGIN
  CREATE TYPE public.waba_connect_status AS ENUM (
    'not_connected', 
    'pending', 
    'connected', 
    'error',
    'token_expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Colunas de integração na tabela public.barbershops
ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS waba_id text,
  ADD COLUMN IF NOT EXISTS waba_phone_number_id text,
  ADD COLUMN IF NOT EXISTS twilio_subaccount_sid text,
  ADD COLUMN IF NOT EXISTS twilio_subaccount_auth_token text,
  ADD COLUMN IF NOT EXISTS sender_sid text,
  ADD COLUMN IF NOT EXISTS waba_connect_status public.waba_connect_status NOT NULL DEFAULT 'not_connected',
  ADD COLUMN IF NOT EXISTS waba_connected_at timestamptz;

-- Comentários de documentação nas colunas
COMMENT ON COLUMN public.barbershops.waba_id IS 'ID da conta WhatsApp Business (WABA ID) obtido via Embedded Signup na Meta';
COMMENT ON COLUMN public.barbershops.waba_phone_number_id IS 'ID do número de telefone registrado na WABA na Meta';
COMMENT ON COLUMN public.barbershops.twilio_subaccount_sid IS 'SID da subconta exclusiva criada na Twilio (Accounts API) para esta barbearia (AC...)';
COMMENT ON COLUMN public.barbershops.twilio_subaccount_auth_token IS 'Auth Token cifrado (AES-256-GCM) da subconta Twilio desta barbearia';
COMMENT ON COLUMN public.barbershops.sender_sid IS 'SID do WhatsApp Sender registrado na Twilio (Senders API) (XE...)';
COMMENT ON COLUMN public.barbershops.waba_connect_status IS 'Status da conexão (not_connected, pending, connected, error, token_expired)';
COMMENT ON COLUMN public.barbershops.waba_connected_at IS 'Data/hora da conclusão do provisionamento e ativação da WABA';

-- 3. Índices para busca rápida de barbearias ao receber webhooks da Meta/Twilio
CREATE INDEX IF NOT EXISTS idx_barbershops_waba_id
  ON public.barbershops (waba_id)
  WHERE waba_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_barbershops_twilio_subaccount_sid
  ON public.barbershops (twilio_subaccount_sid)
  WHERE twilio_subaccount_sid IS NOT NULL;
