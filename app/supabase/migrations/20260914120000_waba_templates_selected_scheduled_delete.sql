-- Vários templates por categoria; um selecionado por categoria; exclusão programada + pin em agendamentos.

ALTER TABLE public.whatsapp_waba_message_templates
  ADD COLUMN IF NOT EXISTS is_selected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deletion_pending_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_last_appointment_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_meta_error text;

ALTER TABLE public.whatsapp_waba_message_templates
  DROP CONSTRAINT IF EXISTS whatsapp_waba_message_templates_one_per_category;

CREATE UNIQUE INDEX IF NOT EXISTS idx_waba_templates_one_selected_per_category
  ON public.whatsapp_waba_message_templates (barbershop_id, sentinela_category)
  WHERE is_selected = true;

-- Marca como selecionado o template aprovado mais recente de cada categoria (dados legados).
UPDATE public.whatsapp_waba_message_templates t
SET is_selected = true
WHERE t.meta_status = 'APPROVED'
  AND t.deletion_pending_at IS NULL
  AND t.id IN (
    SELECT DISTINCT ON (barbershop_id, sentinela_category) id
    FROM public.whatsapp_waba_message_templates
    WHERE meta_status = 'APPROVED' AND deletion_pending_at IS NULL
    ORDER BY barbershop_id, sentinela_category, updated_at DESC NULLS LAST, created_at DESC
  );

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS waba_confirmacao_template_id uuid
    REFERENCES public.whatsapp_waba_message_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS waba_lembrete_template_id uuid
    REFERENCES public.whatsapp_waba_message_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agendamentos_waba_confirmacao_template
  ON public.agendamentos (waba_confirmacao_template_id)
  WHERE waba_confirmacao_template_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agendamentos_waba_lembrete_template
  ON public.agendamentos (waba_lembrete_template_id)
  WHERE waba_lembrete_template_id IS NOT NULL;

COMMENT ON COLUMN public.whatsapp_waba_message_templates.is_selected IS
  'Template ativo para envio da categoria (no máximo 1 por barbershop+categoria).';
COMMENT ON COLUMN public.whatsapp_waba_message_templates.deletion_pending_at IS
  'Exclusão aguardando agendamentos pinados; is_selected deve ser false.';
COMMENT ON COLUMN public.agendamentos.waba_confirmacao_template_id IS
  'Template D-1 (confirmacao) pinado para este agendamento; preenchido na reserva ou ao agendar exclusão.';
COMMENT ON COLUMN public.agendamentos.waba_lembrete_template_id IS
  'Template ~3h (lembrete) pinado para este agendamento.';
