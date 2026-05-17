-- Proteger agendamentos de exclusões em cascata. Agendamentos são o ativo
-- mais importante: nunca podem desaparecer por causa de mudanças em
-- barbeiro/barbearia/serviço/cliente. Trocamos os FKs com CASCADE para
-- comportamentos seguros.

-- 1) agendamentos.barbeiro_id: era CASCADE -> RESTRICT (não deixa apagar
--    barbeiro que tem agendamento; o app já usa soft delete via ativo=false)
ALTER TABLE public.agendamentos
  DROP CONSTRAINT IF EXISTS agendamentos_barbeiro_id_fkey;
ALTER TABLE public.agendamentos
  ADD CONSTRAINT agendamentos_barbeiro_id_fkey
  FOREIGN KEY (barbeiro_id) REFERENCES public.barbeiros(id)
  ON DELETE RESTRICT;

-- 2) agendamentos.barbearia_id: era CASCADE -> RESTRICT
ALTER TABLE public.agendamentos
  DROP CONSTRAINT IF EXISTS agendamentos_barbearia_id_fkey;
ALTER TABLE public.agendamentos
  ADD CONSTRAINT agendamentos_barbearia_id_fkey
  FOREIGN KEY (barbearia_id) REFERENCES public.barbearias(id)
  ON DELETE RESTRICT;

-- 3) agendamentos.service_id já é SET NULL (n) -> mantém. Mas hoje o app
--    apaga e recria barbeiro_services no salvar. Não usamos service_id no
--    booking flow, então tudo bem manter SET NULL.

-- 4) agendamentos.cliente_id já é SET NULL (n) -> mantém.