-- Fase G: barbearia_id SET NULL em agendamentos.

ALTER TABLE public.agendamentos
  DROP CONSTRAINT IF EXISTS agendamentos_barbearia_id_fkey;

ALTER TABLE public.agendamentos
  ALTER COLUMN barbearia_id DROP NOT NULL;

ALTER TABLE public.agendamentos
  ADD CONSTRAINT agendamentos_barbearia_id_fkey
  FOREIGN KEY (barbearia_id) REFERENCES public.barbearias(id) ON DELETE SET NULL;
