-- Link público: holds ativos (aguardando_pagamento) devem bloquear slots na grade,
-- assim como agendamentos confirmados. Sem isso, anon não enxerga o hold via SELECT
-- e o horário continua verde até o segundo "confirmar" retornar slot_taken.

DROP POLICY IF EXISTS "public reads agendamentos confirmados" ON public.agendamentos;

CREATE POLICY "public reads agendamentos confirmados" ON public.agendamentos
  FOR SELECT TO anon, authenticated
  USING (
    public.agendamento_dentro_retencao(data)
    AND (
      status = 'confirmado'::public.agendamento_status
      OR (
        status = 'aguardando_pagamento'::public.agendamento_status
        AND payment_expires_at IS NOT NULL
        AND payment_expires_at >= now()
      )
    )
  );

COMMENT ON POLICY "public reads agendamentos confirmados" ON public.agendamentos IS
  'Link público: lê confirmados e holds de pagamento ativos (15 min) para ocupação da grade.';
