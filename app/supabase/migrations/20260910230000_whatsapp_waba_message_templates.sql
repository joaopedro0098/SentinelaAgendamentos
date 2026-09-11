-- Templates WhatsApp (Meta Graph API) por barbearia: confirmação + lembrete (máx. 1 cada).

CREATE TABLE IF NOT EXISTS public.whatsapp_waba_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id uuid NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  waba_id text NOT NULL,
  sentinela_category text NOT NULL,
  meta_template_id text,
  meta_template_name text NOT NULL,
  language text NOT NULL,
  meta_status text NOT NULL DEFAULT 'PENDING',
  meta_category text NOT NULL DEFAULT 'UTILITY',
  body_display_text text NOT NULL,
  quick_reply_labels text[] NOT NULL DEFAULT '{}',
  meta_rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  CONSTRAINT whatsapp_waba_message_templates_category_check
    CHECK (sentinela_category IN ('confirmacao', 'lembrete')),
  CONSTRAINT whatsapp_waba_message_templates_meta_category_check
    CHECK (meta_category = 'UTILITY'),
  CONSTRAINT whatsapp_waba_message_templates_quick_reply_count_check
    CHECK (cardinality(quick_reply_labels) <= 3),
  CONSTRAINT whatsapp_waba_message_templates_one_per_category
    UNIQUE (barbershop_id, sentinela_category),
  CONSTRAINT whatsapp_waba_message_templates_name_lang_unique
    UNIQUE (barbershop_id, meta_template_name, language)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_waba_templates_shop
  ON public.whatsapp_waba_message_templates (barbershop_id, sentinela_category);

CREATE INDEX IF NOT EXISTS idx_whatsapp_waba_templates_waba
  ON public.whatsapp_waba_message_templates (waba_id, meta_template_name);

CREATE INDEX IF NOT EXISTS idx_whatsapp_waba_templates_meta_id
  ON public.whatsapp_waba_message_templates (meta_template_id)
  WHERE meta_template_id IS NOT NULL;

COMMENT ON TABLE public.whatsapp_waba_message_templates IS
  'Templates UTILITY Meta por barbearia (confirmação/lembrete). Writes via Edge Function.';

ALTER TABLE public.whatsapp_waba_message_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners read own whatsapp waba message templates"
  ON public.whatsapp_waba_message_templates;
CREATE POLICY "owners read own whatsapp waba message templates"
  ON public.whatsapp_waba_message_templates FOR SELECT TO authenticated
  USING (
    barbershop_id IN (
      SELECT b.id FROM public.barbershops b WHERE b.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "no direct write whatsapp waba message templates"
  ON public.whatsapp_waba_message_templates;
CREATE POLICY "no direct write whatsapp waba message templates"
  ON public.whatsapp_waba_message_templates FOR ALL TO authenticated
  USING (false) WITH CHECK (false);
