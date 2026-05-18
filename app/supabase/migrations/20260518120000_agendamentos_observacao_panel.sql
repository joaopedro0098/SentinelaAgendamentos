-- Observação no agendamento + leitura pelo dono da barbearia (painel)

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS observacao text;

COMMENT ON COLUMN public.agendamentos.observacao IS 'Observações opcionais do cliente ou da barbearia';

DROP POLICY IF EXISTS "owner reads agendamentos" ON public.agendamentos;
CREATE POLICY "owner reads agendamentos" ON public.agendamentos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.barbearias b
      WHERE b.id = barbearia_id AND b.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.barbearias b
      INNER JOIN public.barbershops s ON s.slug = b.slug
      WHERE b.id = barbearia_id AND s.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "owner updates agendamentos" ON public.agendamentos;
CREATE POLICY "owner updates agendamentos" ON public.agendamentos
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.barbearias b
      WHERE b.id = barbearia_id AND b.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.barbearias b
      INNER JOIN public.barbershops s ON s.slug = b.slug
      WHERE b.id = barbearia_id AND s.owner_id = auth.uid()
    )
  );
