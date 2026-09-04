-- Tentativas de Embedded Signup Meta Direct (fast path + polling de segurança).

CREATE TABLE IF NOT EXISTS public.waba_connect_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'code_received', 'completed', 'expired', 'failed', 'ambiguous')),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  code_received_at timestamptz,
  discovered_waba_id text,
  discovered_phone_number_id text,
  discovered_business_id text,
  discovered_meta_user_id text,
  discovered_flow_type text
    CHECK (
      discovered_flow_type IS NULL
      OR discovered_flow_type IN ('new_phone_number', 'only_waba', 'existing_phone_number')
    ),
  known_waba_ids_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  completed_at timestamptz,
  completed_via text
    CHECK (completed_via IS NULL OR completed_via IN ('frontend', 'fast_path', 'cron_poll')),
  error_message text
);

COMMENT ON TABLE public.waba_connect_attempts IS
  'Tentativas de conexão Embedded Signup Meta Direct. Fast path (code) + cron poll como fallback.';

CREATE INDEX IF NOT EXISTS idx_waba_connect_attempts_open
  ON public.waba_connect_attempts (started_at)
  WHERE status IN ('pending', 'code_received');

CREATE INDEX IF NOT EXISTS idx_waba_connect_attempts_shop
  ON public.waba_connect_attempts (shop_id, started_at DESC);

ALTER TABLE public.waba_connect_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no public waba connect attempts" ON public.waba_connect_attempts;
CREATE POLICY "no public waba connect attempts"
  ON public.waba_connect_attempts FOR ALL USING (false) WITH CHECK (false);
