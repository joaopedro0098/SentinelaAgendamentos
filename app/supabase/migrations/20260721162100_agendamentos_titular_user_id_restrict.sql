-- Fase G: titular_user_id RESTRICT em agendamentos.

ALTER TABLE public.agendamentos
  DROP CONSTRAINT IF EXISTS agendamentos_titular_user_id_fkey;

ALTER TABLE public.agendamentos
  ADD CONSTRAINT agendamentos_titular_user_id_fkey
  FOREIGN KEY (titular_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
