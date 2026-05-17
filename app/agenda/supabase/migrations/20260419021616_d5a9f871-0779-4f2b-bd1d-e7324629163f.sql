-- 1) Horários de funcionamento (jsonb) e início do trial
ALTER TABLE public.barbearias
  ADD COLUMN IF NOT EXISTS horarios_funcionamento jsonb NOT NULL DEFAULT '{
    "0": {"aberto": false, "inicio": "09:00", "fim": "18:00"},
    "1": {"aberto": true,  "inicio": "09:00", "fim": "19:00"},
    "2": {"aberto": true,  "inicio": "09:00", "fim": "19:00"},
    "3": {"aberto": true,  "inicio": "09:00", "fim": "19:00"},
    "4": {"aberto": true,  "inicio": "09:00", "fim": "19:00"},
    "5": {"aberto": true,  "inicio": "09:00", "fim": "19:00"},
    "6": {"aberto": true,  "inicio": "09:00", "fim": "17:00"}
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS trial_iniciado_em timestamptz;

-- Backfill trial para registros existentes
UPDATE public.barbearias
SET trial_iniciado_em = COALESCE(trial_iniciado_em, created_at)
WHERE trial_iniciado_em IS NULL;

-- Default daqui pra frente
ALTER TABLE public.barbearias
  ALTER COLUMN trial_iniciado_em SET DEFAULT now();

-- 2) Atualizar planos com os valores corretos (upsert por tipo)
INSERT INTO public.planos (tipo, nome_exibicao, preco, limite_clientes_mensais, mp_plan_id, ativo)
VALUES
  ('basico',        'Básico',        57.00,  300,  'mp_basico_pending',  true),
  ('intermediario', 'Intermediário', 77.00,  500,  'mp_inter_pending',   true),
  ('avancado',      'Avançado',     117.00, 1100,  'mp_avancado_pending',true)
ON CONFLICT DO NOTHING;

-- Atualiza valores caso já existam
UPDATE public.planos SET preco = 57.00,  limite_clientes_mensais = 300,  nome_exibicao = 'Básico'        WHERE tipo = 'basico';
UPDATE public.planos SET preco = 77.00,  limite_clientes_mensais = 500,  nome_exibicao = 'Intermediário' WHERE tipo = 'intermediario';
UPDATE public.planos SET preco = 117.00, limite_clientes_mensais = 1100, nome_exibicao = 'Avançado'      WHERE tipo = 'avancado';