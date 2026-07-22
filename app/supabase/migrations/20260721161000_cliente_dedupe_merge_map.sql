-- Fase E0: auditoria permanente de merges de clientes (reversão manual).

CREATE TABLE IF NOT EXISTS public.cliente_dedupe_merge_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merge_batch_id uuid NOT NULL,
  titular_user_id uuid NOT NULL,
  whatsapp_digits text NOT NULL,
  old_cliente_id uuid NOT NULL,
  new_cliente_id uuid NOT NULL,
  survivor_rank int NOT NULL,
  merged_at timestamptz NOT NULL DEFAULT now(),
  old_row_snapshot jsonb NOT NULL,
  agendamentos_remapped int NOT NULL DEFAULT 0,
  UNIQUE (old_cliente_id)
);

CREATE INDEX IF NOT EXISTS idx_cliente_dedupe_merge_map_titular_whatsapp
  ON public.cliente_dedupe_merge_map (titular_user_id, whatsapp_digits);

CREATE INDEX IF NOT EXISTS idx_cliente_dedupe_merge_map_new_cliente
  ON public.cliente_dedupe_merge_map (new_cliente_id);

COMMENT ON TABLE public.cliente_dedupe_merge_map IS
  'old_cliente_id → new_cliente_id após dedupe Fase E. Reversão manual: restaurar snapshot + remapear agendamentos usando este log.';

ALTER TABLE public.cliente_dedupe_merge_map ENABLE ROW LEVEL SECURITY;
