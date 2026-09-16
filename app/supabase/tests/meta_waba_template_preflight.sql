-- Pré-voo: templates WABA selecionados/aprovados antes do primeiro envio Meta Direct.
-- Rode no SQL Editor (service role / admin). Opcional: filtrar barbershop_id.

-- Todas as barbearias Meta conectadas + template selecionado por categoria
SELECT
  s.id AS barbershop_id,
  s.slug,
  s.waba_connect_status,
  s.waba_phone_number_id,
  t.sentinela_category,
  t.meta_template_name,
  t.meta_status,
  t.is_selected,
  t.language,
  t.body_display_text,
  t.deletion_pending_at,
  t.updated_at AS template_updated_at
FROM public.barbershops s
LEFT JOIN public.whatsapp_waba_message_templates t
  ON t.barbershop_id = s.id
  AND t.is_selected = true
  AND t.deletion_pending_at IS NULL
WHERE s.whatsapp_messaging_provider = 'meta'
  AND s.waba_connect_status = 'connected'
ORDER BY s.slug, t.sentinela_category;

-- Gaps: Meta conectada mas sem template selecionado aprovado (confirmação ou lembrete)
WITH meta_shops AS (
  SELECT id, slug
  FROM public.barbershops
  WHERE whatsapp_messaging_provider = 'meta'
    AND waba_connect_status = 'connected'
),
expected AS (
  SELECT id AS barbershop_id, slug, cat.sentinela_category
  FROM meta_shops
  CROSS JOIN (
    VALUES ('confirmacao'::text), ('lembrete'::text)
  ) AS cat(sentinela_category)
)
SELECT
  e.barbershop_id,
  e.slug,
  e.sentinela_category AS categoria_esperada,
  t.meta_template_name,
  t.meta_status,
  t.is_selected,
  t.body_display_text
FROM expected e
LEFT JOIN public.whatsapp_waba_message_templates t
  ON t.barbershop_id = e.barbershop_id
  AND t.sentinela_category = e.sentinela_category
  AND t.is_selected = true
  AND t.deletion_pending_at IS NULL
WHERE t.id IS NULL
   OR t.meta_status IS DISTINCT FROM 'APPROVED'
ORDER BY e.slug, e.sentinela_category;

-- Uma barbearia específica (descomente e substitua o UUID):
-- AND s.id = '00000000-0000-0000-0000-000000000000'
