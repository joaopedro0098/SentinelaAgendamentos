-- Fase G: apagar barbearia não apaga cadastro clínico (titular_user_id permanece custodiante).

ALTER TABLE public.clientes
  DROP CONSTRAINT IF EXISTS clientes_barbearia_id_fkey;

ALTER TABLE public.clientes
  ALTER COLUMN barbearia_id DROP NOT NULL;

ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_barbearia_id_fkey
  FOREIGN KEY (barbearia_id) REFERENCES public.barbearias(id) ON DELETE SET NULL;
