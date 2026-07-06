-- Idempotência de webhooks Mercado Pago (plataforma): evita reprocessar o mesmo evento.

CREATE TABLE IF NOT EXISTS public.mp_webhook_events (
  event_key text PRIMARY KEY,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  resource_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mp_webhook_events IS
  'Eventos de webhook MP já processados (assinatura plataforma e demais). Chave única por notificação + status.';

ALTER TABLE public.mp_webhook_events ENABLE ROW LEVEL SECURITY;
