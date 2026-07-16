-- 1) Idempotência de envio ao profissional (evita cobrança duplicada em retry)
-- 2) RPCs admin para visibilidade de jobs WhatsApp com status failed

ALTER TABLE public.alertas_agendamento
  ADD COLUMN IF NOT EXISTS mensagem_profissional_enviada_em timestamptz;

COMMENT ON COLUMN public.alertas_agendamento.mensagem_profissional_enviada_em IS
  'Preenchido somente após envio Twilio ao profissional confirmado. Retry do worker pula reenvio se já preenchido.';

CREATE OR REPLACE FUNCTION public.admin_whatsapp_webhook_jobs_failed_count_24h()
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN 0;
  END IF;

  RETURN (
    SELECT count(*)::int
    FROM public.whatsapp_webhook_jobs j
    WHERE j.status = 'failed'
      AND j.processed_at >= now() - interval '24 hours'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_whatsapp_webhook_jobs_failed_count_24h() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_whatsapp_webhook_jobs_failed_count_24h() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_failed_whatsapp_webhook_jobs(p_limit int DEFAULT 100)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _limit int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  _limit := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);

  RETURN (
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.processed_at DESC NULLS LAST, t.created_at DESC), '[]'::json)
    FROM (
      SELECT
        j.id,
        j.telefone,
        j.body AS resposta,
        j.last_error,
        j.attempts,
        j.max_attempts,
        j.created_at,
        j.processed_at
      FROM public.whatsapp_webhook_jobs j
      WHERE j.status = 'failed'
      ORDER BY j.processed_at DESC NULLS LAST, j.created_at DESC
      LIMIT _limit
    ) t
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_failed_whatsapp_webhook_jobs(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_failed_whatsapp_webhook_jobs(int) TO authenticated;
