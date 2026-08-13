-- Migration B: Cria índice parcial em waba_connect_status = 'provisioning'
-- DEVE ser executada em uma transação/migration separada da Migration A que fez o ADD VALUE,
-- pois o PostgreSQL não permite usar um enum recém-criado na mesma transação.

CREATE INDEX IF NOT EXISTS idx_barbershops_waba_provisioning_lock
  ON public.barbershops (updated_at)
  WHERE waba_connect_status = 'provisioning';
