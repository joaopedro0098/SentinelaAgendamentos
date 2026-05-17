-- Observação no agendamento + leitura pelo dono da barbearia (painel)

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS observacao text;

COMMENT ON COLUMN public.agendamentos.observacao IS 'Observações opcionais do cliente ou da barbearia';

DROP POLICY IF EXISTS "owner reads agendamentos" ON public.agendamentos;
CREATE POLICY "owner reads agendamentos" ON public.agendamentos
  FOR SELECT TO authenticated
  USING (barbearia_id = public.user_barbearia_id(auth.uid()));

DROP POLICY IF EXISTS "owner updates agendamentos" ON public.agendamentos;
CREATE POLICY "owner updates agendamentos" ON public.agendamentos
  FOR UPDATE TO authenticated
  USING (barbearia_id = public.user_barbearia_id(auth.uid()));
