-- Fase D: soft delete (archived_at/archived_by) + marcador de retenção no paciente (clientes).
-- retention_until = last_clinical_activity_at + 20 anos (coluna gerada), independente de arquivamento.
-- last_clinical_activity_at: backfill aqui; mantido depois pela Fase D2 (função + triggers).
-- Nenhum job apaga dados ao vencer retention_until — marcador informativo apenas.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_clinical_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS retention_until timestamptz GENERATED ALWAYS AS (
    ((last_clinical_activity_at AT TIME ZONE 'UTC') + interval '20 years') AT TIME ZONE 'UTC'
  ) STORED;

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.agendamento_anotacoes
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.paciente_documentos
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.clientes.archived_at IS
  'Soft delete do cadastro do paciente. Nenhuma RPC seta isso nesta fase.';
COMMENT ON COLUMN public.clientes.last_clinical_activity_at IS
  'Instante do último registro clínico (anotação, agendamento concluído ou documento). Backfill Fase D; Fase D2 mantém via triggers.';
COMMENT ON COLUMN public.clientes.retention_until IS
  'Marcador informativo (last_clinical_activity_at + 20 anos). Nenhum job apaga automaticamente ao vencer.';

COMMENT ON COLUMN public.agendamentos.archived_at IS
  'Soft delete do agendamento. Nenhuma RPC seta isso nesta fase.';
COMMENT ON COLUMN public.agendamento_anotacoes.archived_at IS
  'Soft delete da anotação. Nenhuma RPC seta isso nesta fase.';
COMMENT ON COLUMN public.paciente_documentos.archived_at IS
  'Soft delete do metadado. O blob no storage NÃO é apagado junto — permanece até política futura.';

-- Backfill last_clinical_activity_at (mesma regra que compute_cliente_last_clinical_activity_at na Fase D2).
UPDATE public.clientes c
SET last_clinical_activity_at = sub.activity_at
FROM (
  SELECT
    c2.id AS cliente_id,
    NULLIF(
      GREATEST(
        COALESCE(ann.max_an, '-infinity'::timestamptz),
        COALESCE(ag.max_slot, '-infinity'::timestamptz),
        COALESCE(doc.max_doc, '-infinity'::timestamptz)
      ),
      '-infinity'::timestamptz
    ) AS activity_at
  FROM public.clientes c2
  LEFT JOIN LATERAL (
    SELECT MAX(GREATEST(an.created_at, an.updated_at)) AS max_an
    FROM public.agendamento_anotacoes an
    INNER JOIN public.agendamentos a ON a.id = an.agendamento_id
    WHERE a.cliente_id = c2.id
  ) ann ON true
  LEFT JOIN LATERAL (
    SELECT MAX((a.data + a.hora) AT TIME ZONE 'America/Sao_Paulo') AS max_slot
    FROM public.agendamentos a
    WHERE a.cliente_id = c2.id
      AND a.status = 'concluido'::public.agendamento_status
  ) ag ON true
  LEFT JOIN LATERAL (
    SELECT MAX(pd.created_at) AS max_doc
    FROM public.paciente_documentos pd
    WHERE pd.barbearia_id = c2.barbearia_id
      AND pd.whatsapp_digits = public.cliente_whatsapp_digits(c2.whatsapp)
  ) doc ON true
) sub
WHERE c.id = sub.cliente_id
  AND sub.activity_at IS NOT NULL;
