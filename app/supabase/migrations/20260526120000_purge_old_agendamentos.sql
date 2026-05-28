-- Remove agendamentos cujo dia de atendimento completou 2 meses (fuso America/Sao_Paulo).

CREATE OR REPLACE FUNCTION public.purge_old_agendamentos()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _today date;
  _count integer;
BEGIN
  _today := (timezone('America/Sao_Paulo', now()))::date;

  DELETE FROM public.agendamentos a
  WHERE (a.data + INTERVAL '2 months') < _today;

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_agendamentos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_old_agendamentos() TO service_role;

COMMENT ON FUNCTION public.purge_old_agendamentos() IS
  'Exclui agendamentos passados há mais de 2 meses (data + 2 meses < hoje em America/Sao_Paulo).';

-- Agenda execução diária quando pg_cron estiver habilitado no projeto Supabase.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('purge-old-agendamentos-daily');
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      'purge-old-agendamentos-daily',
      '15 4 * * *',
      'SELECT public.purge_old_agendamentos();'
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron indisponível; use a Edge Function purge-old-appointments com cron externo.';
END;
$$;
