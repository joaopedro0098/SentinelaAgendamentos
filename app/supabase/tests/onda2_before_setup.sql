-- Onda 2 test plan — ANTES (read-only on remote)

SELECT 'SETUP' AS phase, aa.aggregated_user_id AS ca_user_id, aa.owner_user_id AS ct_user_id
FROM public.aggregated_accounts aa
WHERE aa.owner_user_id = 'b31a6a89-55a8-431b-b0c4-764071270390'::uuid
  AND aa.status = 'active'::public.aggregated_account_status
LIMIT 1;

SELECT 'BASELINE' AS phase,
  count(DISTINCT public.cliente_whatsapp_digits(a.cliente_whatsapp)) AS distinct_whatsapps,
  count(*) FILTER (WHERE a.barbearia_id IS NULL AND a.archived_at IS NULL) AS orfaos_ativos,
  count(*) FILTER (WHERE a.archived_at IS NOT NULL) AS arquivados
FROM public.agendamentos a
WHERE a.titular_user_id = 'b31a6a89-55a8-431b-b0c4-764071270390'::uuid;
