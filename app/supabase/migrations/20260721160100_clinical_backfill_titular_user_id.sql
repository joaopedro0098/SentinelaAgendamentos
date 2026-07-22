-- Fase B: backfill de titular_user_id nas linhas já existentes.
--
-- CAVEAT (importante, sem solução melhor disponível): não existe histórico de QUANDO uma
-- agregação CT/CA esteve ativa no passado — aggregated_accounts só guarda o estado ATUAL.
-- Este backfill usa o estado atual como aproximação: se a barbearia dona do registro
-- pertence a uma CA hoje agregada ativa, titular = CT (owner_user_id); senão, titular =
-- dono da própria barbearia (CT solo ou CA solo). Registros antigos de uma CA que já foi
-- desagregada (ou nunca esteve agregada) ficam com titular = ela mesma neste backfill,
-- mesmo que histórico real fosse diferente. A partir da Fase H, novos registros gravam
-- titular_user_id no momento da criação (sem essa aproximação).
--
-- Idempotente: cada UPDATE só afeta linhas com titular_user_id IS NULL, pode ser rodado
-- de novo sem duplicar/sobrescrever trabalho já feito.

WITH shop_titular AS (
  SELECT
    s.slug,
    COALESCE(
      (
        SELECT aa.owner_user_id
        FROM public.aggregated_accounts aa
        WHERE aa.aggregated_user_id = s.owner_id
          AND aa.status = 'active'::public.aggregated_account_status
        LIMIT 1
      ),
      s.owner_id
    ) AS titular_user_id
  FROM public.barbershops s
)
UPDATE public.clientes c
SET titular_user_id = st.titular_user_id
FROM public.barbearias b
JOIN shop_titular st ON st.slug = b.slug
WHERE c.barbearia_id = b.id
  AND c.titular_user_id IS NULL;

WITH shop_titular AS (
  SELECT
    s.slug,
    COALESCE(
      (
        SELECT aa.owner_user_id
        FROM public.aggregated_accounts aa
        WHERE aa.aggregated_user_id = s.owner_id
          AND aa.status = 'active'::public.aggregated_account_status
        LIMIT 1
      ),
      s.owner_id
    ) AS titular_user_id
  FROM public.barbershops s
)
UPDATE public.agendamentos a
SET titular_user_id = st.titular_user_id
FROM public.barbearias b
JOIN shop_titular st ON st.slug = b.slug
WHERE a.barbearia_id = b.id
  AND a.titular_user_id IS NULL;

-- Anotações herdam o titular do agendamento (relação 1:1, sempre resolvido acima).
UPDATE public.agendamento_anotacoes an
SET titular_user_id = a.titular_user_id
FROM public.agendamentos a
WHERE an.agendamento_id = a.id
  AND an.titular_user_id IS NULL
  AND a.titular_user_id IS NOT NULL;

WITH shop_titular AS (
  SELECT
    s.slug,
    COALESCE(
      (
        SELECT aa.owner_user_id
        FROM public.aggregated_accounts aa
        WHERE aa.aggregated_user_id = s.owner_id
          AND aa.status = 'active'::public.aggregated_account_status
        LIMIT 1
      ),
      s.owner_id
    ) AS titular_user_id
  FROM public.barbershops s
)
UPDATE public.paciente_documentos pd
SET titular_user_id = st.titular_user_id
FROM public.barbearias b
JOIN shop_titular st ON st.slug = b.slug
WHERE pd.barbearia_id = b.id
  AND pd.titular_user_id IS NULL;

-- Relatório de órfãos: não falha a migration, só informa (visível em `supabase db push` / logs).
DO $$
DECLARE
  _clientes_orfaos int;
  _agendamentos_orfaos int;
  _anotacoes_orfaos int;
  _documentos_orfaos int;
BEGIN
  SELECT count(*) INTO _clientes_orfaos FROM public.clientes WHERE titular_user_id IS NULL;
  SELECT count(*) INTO _agendamentos_orfaos FROM public.agendamentos WHERE titular_user_id IS NULL;
  SELECT count(*) INTO _anotacoes_orfaos FROM public.agendamento_anotacoes WHERE titular_user_id IS NULL;
  SELECT count(*) INTO _documentos_orfaos FROM public.paciente_documentos WHERE titular_user_id IS NULL;

  RAISE NOTICE 'Backfill titular_user_id — órfãos restantes: clientes=%, agendamentos=%, agendamento_anotacoes=%, paciente_documentos=%',
    _clientes_orfaos, _agendamentos_orfaos, _anotacoes_orfaos, _documentos_orfaos;
END $$;
