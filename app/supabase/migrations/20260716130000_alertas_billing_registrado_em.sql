-- Separa idempotência de envio Twilio vs registro de billing no alerta ao profissional.

ALTER TABLE public.alertas_agendamento
  ADD COLUMN IF NOT EXISTS billing_registrado_em timestamptz;

COMMENT ON COLUMN public.alertas_agendamento.mensagem_profissional_enviada_em IS
  'Preenchido imediatamente após sendWhatsAppTemplate confirmar sucesso. Retry pula reenvio se preenchido.';

COMMENT ON COLUMN public.alertas_agendamento.billing_registrado_em IS
  'Preenchido após registrarUsoMensageria confirmar sucesso. Retry registra billing se mensagem já enviada mas billing pendente.';
