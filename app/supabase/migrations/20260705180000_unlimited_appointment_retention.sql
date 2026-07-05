-- Retenção ilimitada: agendamentos não são mais excluídos após 2 meses.

CREATE OR REPLACE FUNCTION public.agendamento_dentro_retencao(_data date)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT true;
$$;

COMMENT ON FUNCTION public.agendamento_dentro_retencao(date) IS
  'Retenção ilimitada: todos os agendamentos permanecem consultáveis.';

CREATE OR REPLACE FUNCTION public.purge_old_agendamentos()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN 0;
END;
$$;

COMMENT ON FUNCTION public.purge_old_agendamentos() IS
  'Desativado: agendamentos são preservados por tempo ilimitado (não exclui registros).';

-- Remove cron de purge diário, se existir.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('purge-old-agendamentos-daily');
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END;
$$;
