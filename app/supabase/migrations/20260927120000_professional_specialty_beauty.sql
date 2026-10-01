-- Especialidades beleza (salão / barbearia) no cadastro.
-- Valores do enum em migration separada da função (PostgreSQL: 55P04 na mesma transação).

ALTER TYPE public.professional_specialty ADD VALUE IF NOT EXISTS 'salao_beleza';
ALTER TYPE public.professional_specialty ADD VALUE IF NOT EXISTS 'barbearia';
