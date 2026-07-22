-- Fase J: remove definitivamente o purge de agendamentos por idade (2 meses).
-- purge_old_agendamentos já era no-op desde 20260705180000; cron purge-old-agendamentos-daily já removido.
-- Não altera expirar_agendamentos_aguardando_pagamento nem o cron de holds.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('purge-old-agendamentos-daily');
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.purge_old_agendamentos();

COMMENT ON FUNCTION public.agendamento_dentro_retencao(date) IS
  'Retenção ilimitada: todos os agendamentos permanecem consultáveis (purge por idade removido na Fase J).';
