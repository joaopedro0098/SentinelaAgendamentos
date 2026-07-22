-- Fase G: titular_user_id RESTRICT em agendamento_anotacoes.

ALTER TABLE public.agendamento_anotacoes
  DROP CONSTRAINT IF EXISTS agendamento_anotacoes_titular_user_id_fkey;

ALTER TABLE public.agendamento_anotacoes
  ADD CONSTRAINT agendamento_anotacoes_titular_user_id_fkey
  FOREIGN KEY (titular_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
