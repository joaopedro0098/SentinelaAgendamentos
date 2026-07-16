-- Rastreio do SID Twilio no alerta ao profissional (mesmo padrão de whatsapp_mensagens_enviadas).

ALTER TABLE public.alertas_agendamento
  ADD COLUMN IF NOT EXISTS twilio_message_sid text;

COMMENT ON COLUMN public.alertas_agendamento.twilio_message_sid IS
  'MessageSid Twilio do alerta enviado ao profissional. Gravado junto com mensagem_profissional_enviada_em no mesmo UPDATE. '
  'Permite detectar envio já feito em retry se o timestamp falhou mas o SID foi persistido.';
