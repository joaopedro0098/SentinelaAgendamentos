-- Remove pagamento Stripe de agendamentos (Connect, hold, parcelas).
-- Assinatura/planos (stripe_customer_id, subscription_status, etc.) permanece intacta.

-- Cron de expiração de holds
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'expirar-aguardando-pagamento';
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_column THEN NULL;
END $$;

-- Cancela holds pendentes antes de remover colunas/índices
UPDATE public.agendamentos
SET
  status = 'cancelado'::public.agendamento_status,
  cancelado_por = 'sistema'
WHERE status = 'aguardando_pagamento'::public.agendamento_status;

-- Funções (ordem: dependentes primeiro)
DROP FUNCTION IF EXISTS public.update_agendamento_installment_checkout(uuid, uuid, int);
DROP FUNCTION IF EXISTS public.calculate_installment_checkout_for_barbearia(uuid, int, int);
DROP FUNCTION IF EXISTS public.calculate_installment_checkout_centavos(int, int, boolean, smallint, jsonb);
DROP FUNCTION IF EXISTS public.installment_config_enabled(smallint, jsonb);
DROP FUNCTION IF EXISTS public.normalize_installment_surcharge_rates(jsonb, int);
DROP FUNCTION IF EXISTS public.clamp_installment_surcharge_percent(numeric);
DROP FUNCTION IF EXISTS public.create_public_booking_payment_hold(uuid, uuid, date, time, text, text, uuid, int, text[], text);
DROP FUNCTION IF EXISTS public.cancel_public_booking_payment_hold(uuid, uuid);
DROP FUNCTION IF EXISTS public.confirm_appointment_payment(uuid, text);
DROP FUNCTION IF EXISTS public.fail_appointment_payment(uuid, text);
DROP FUNCTION IF EXISTS public.expirar_agendamentos_aguardando_pagamento();
DROP FUNCTION IF EXISTS public.calculate_appointment_payment_centavos(uuid, text[], public.appointment_payment_mode, public.appointment_deposit_type, int);
DROP FUNCTION IF EXISTS public.get_effective_appointment_payment_settings(uuid);
DROP FUNCTION IF EXISTS public.get_payment_panel_settings();
DROP FUNCTION IF EXISTS public.update_payment_panel_settings(boolean, text, text, int);
DROP FUNCTION IF EXISTS public.update_payment_panel_settings(boolean, text, text, int, boolean, int, jsonb);
DROP FUNCTION IF EXISTS public.shop_has_all_active_service_prices(uuid);
DROP FUNCTION IF EXISTS public.payment_destination_shop_id(uuid);
DROP FUNCTION IF EXISTS public.titular_shop_id_for_shop(uuid);
DROP FUNCTION IF EXISTS public.shop_id_for_barbearia(uuid);

-- Índices de pagamento / slot com hold
DROP INDEX IF EXISTS public.idx_agendamentos_payment_intent;
DROP INDEX IF EXISTS public.idx_agendamentos_aguardando_pagamento_expires;
DROP INDEX IF EXISTS public.agendamentos_barbeiro_data_hora_ocupado_key;

CREATE UNIQUE INDEX IF NOT EXISTS agendamentos_barbeiro_data_hora_confirmado_key
  ON public.agendamentos (barbeiro_id, data, hora)
  WHERE status = 'confirmado'::public.agendamento_status;

-- Colunas agendamentos
ALTER TABLE public.agendamentos
  DROP COLUMN IF EXISTS payment_intent_id,
  DROP COLUMN IF EXISTS payment_status,
  DROP COLUMN IF EXISTS valor_pago_centavos,
  DROP COLUMN IF EXISTS valor_restante_centavos,
  DROP COLUMN IF EXISTS valor_base_centavos,
  DROP COLUMN IF EXISTS payment_expires_at,
  DROP COLUMN IF EXISTS installment_count,
  DROP COLUMN IF EXISTS installment_surcharge_centavos,
  DROP COLUMN IF EXISTS installment_fixed_fee_centavos;

-- Colunas barbershops (Connect + config agendamento)
ALTER TABLE public.barbershops
  DROP COLUMN IF EXISTS stripe_connect_account_id,
  DROP COLUMN IF EXISTS stripe_connect_status,
  DROP COLUMN IF EXISTS stripe_connect_email,
  DROP COLUMN IF EXISTS payments_centralized,
  DROP COLUMN IF EXISTS appointment_payment_mode,
  DROP COLUMN IF EXISTS appointment_deposit_type,
  DROP COLUMN IF EXISTS appointment_deposit_value,
  DROP COLUMN IF EXISTS installment_pass_fee_to_client,
  DROP COLUMN IF EXISTS installment_max_count,
  DROP COLUMN IF EXISTS installment_surcharge_rates;

-- Enums exclusivos de pagamento de agendamento
DROP TYPE IF EXISTS public.appointment_payment_mode;
DROP TYPE IF EXISTS public.appointment_deposit_type;
DROP TYPE IF EXISTS public.stripe_connect_status;
DROP TYPE IF EXISTS public.appointment_payment_status;

-- Nota: o valor 'aguardando_pagamento' em agendamento_status permanece no enum PG
-- (PostgreSQL não permite remover valores de enum com segurança). Não é mais usado.
