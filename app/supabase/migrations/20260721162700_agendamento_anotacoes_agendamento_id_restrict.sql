-- Fase G: DELETE físico de agendamento não apaga anotação silenciosamente.

ALTER TABLE public.agendamento_anotacoes
  DROP CONSTRAINT IF EXISTS agendamento_anotacoes_agendamento_id_fkey;

ALTER TABLE public.agendamento_anotacoes
  ADD CONSTRAINT agendamento_anotacoes_agendamento_id_fkey
  FOREIGN KEY (agendamento_id) REFERENCES public.agendamentos(id) ON DELETE RESTRICT;
