-- Primeira entrada no app após cadastro: abrir aba Suporte (flag persiste no servidor).
ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS welcome_support_pending boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.barbershops.welcome_support_pending IS
  'Quando true, redireciona o dono para /app/suporte na primeira entrada ao painel.';

-- Contas já existentes não devem ver o redirecionamento.
UPDATE public.barbershops
SET welcome_support_pending = false
WHERE welcome_support_pending = true;
