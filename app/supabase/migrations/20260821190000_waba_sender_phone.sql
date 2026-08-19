ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS sender_phone_e164 text;

COMMENT ON COLUMN public.barbershops.sender_phone_e164 IS
  'Número completo no formato whatsapp:+55... do Sender Twilio desta barbearia (mesmo valor de sender_id na Twilio)';
