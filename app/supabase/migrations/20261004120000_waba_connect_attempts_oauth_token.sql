-- Token OAuth temporário (cifrado) na tentativa Embedded Signup — mesma cifra que barbershops.waba_access_token_encrypted.

ALTER TABLE public.waba_connect_attempts
  ADD COLUMN IF NOT EXISTS oauth_access_token_encrypted text;

COMMENT ON COLUMN public.waba_connect_attempts.oauth_access_token_encrypted IS
  'Access token Meta cifrado (AES-256-GCM v1) entre a 1ª submit_code e conclusão/expiração. Nunca logar em texto claro.';

ALTER TABLE public.waba_connect_attempts
  DROP CONSTRAINT IF EXISTS waba_connect_attempts_status_check;

ALTER TABLE public.waba_connect_attempts
  ADD CONSTRAINT waba_connect_attempts_status_check
  CHECK (status IN (
    'pending',
    'code_received',
    'completing',
    'completed',
    'expired',
    'failed',
    'ambiguous'
  ));
