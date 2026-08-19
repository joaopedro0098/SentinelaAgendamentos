-- Billing: lembrete WhatsApp ~3h antes entra no log de uso (mesmo enum da RPC registrar_uso_mensageria).

ALTER TABLE public.whatsapp_usage_log
  DROP CONSTRAINT IF EXISTS whatsapp_usage_log_tipo_check;

ALTER TABLE public.whatsapp_usage_log
  ADD CONSTRAINT whatsapp_usage_log_tipo_check
  CHECK (tipo IN ('lembrete_d1', 'lembrete_3h', 'alerta_profissional'));

COMMENT ON TABLE public.whatsapp_usage_log IS
  'Log interno de toda mensagem WhatsApp disparada pelo backend, para cobrança futura via Stripe Meter Events. '
  'Tipos: lembrete_d1 (D-1 com botões), lembrete_3h (dia do agendamento, sem botões), alerta_profissional.';
