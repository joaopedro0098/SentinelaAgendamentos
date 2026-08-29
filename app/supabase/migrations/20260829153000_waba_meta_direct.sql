-- Meta Direct (Tech Provider): token, PIN de registro e metadados do Embedded Signup.

ALTER TYPE public.whatsapp_messaging_provider ADD VALUE IF NOT EXISTS 'meta';

ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS waba_access_token_encrypted text,
  ADD COLUMN IF NOT EXISTS waba_register_pin text,
  ADD COLUMN IF NOT EXISTS waba_flow_type text,
  ADD COLUMN IF NOT EXISTS waba_business_id text;

COMMENT ON COLUMN public.barbershops.waba_access_token_encrypted IS
  'Access token Meta pós Embedded Signup Direct (AES-256-GCM, WABA_TOKEN_ENCRYPTION_KEY).';
COMMENT ON COLUMN public.barbershops.waba_register_pin IS
  'PIN de 6 dígitos para POST /{phone_number_id}/register na Meta; persistido por tenant/número.';
COMMENT ON COLUMN public.barbershops.waba_flow_type IS
  'Tipo de fluxo Embedded Signup: new_phone_number | only_waba | existing_phone_number.';
COMMENT ON COLUMN public.barbershops.waba_business_id IS
  'Meta Business Portfolio ID retornado no Embedded Signup (opcional).';

DO $$ BEGIN
  ALTER TABLE public.barbershops
    ADD CONSTRAINT barbershops_waba_flow_type_check
    CHECK (
      waba_flow_type IS NULL
      OR waba_flow_type IN ('new_phone_number', 'only_waba', 'existing_phone_number')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
