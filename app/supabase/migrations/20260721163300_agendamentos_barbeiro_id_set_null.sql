-- Fase L (correção pós-smoke E2E real): agendamentos.barbeiro_id ainda tinha ON DELETE CASCADE
-- para public.barbeiros. delete-account/admin-purge-user apagam fisicamente os barbeiros (config
-- de agenda, não é dado clínico) depois de arquivar os agendamentos — mas o CASCADE em barbeiro_id
-- destrói fisicamente os agendamentos já arquivados nesse mesmo passo, violando a garantia de
-- "nunca apagar dado clínico" da Fase L. Mesmo ajuste que já foi feito para barbearia_id.

ALTER TABLE public.agendamentos
  DROP CONSTRAINT IF EXISTS agendamentos_barbeiro_id_fkey;

ALTER TABLE public.agendamentos
  ALTER COLUMN barbeiro_id DROP NOT NULL;

ALTER TABLE public.agendamentos
  ADD CONSTRAINT agendamentos_barbeiro_id_fkey
  FOREIGN KEY (barbeiro_id) REFERENCES public.barbeiros(id) ON DELETE SET NULL;
