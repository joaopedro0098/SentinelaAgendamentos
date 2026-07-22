-- Fase I smoke test 3: archive documento metadado
SELECT set_config('request.jwt.claim.sub', 'eddba38d-fb2a-461c-997a-de91371cba65', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

WITH ins AS (
  INSERT INTO public.paciente_documentos (
    barbearia_id, whatsapp_digits, file_name, mime_type, size_bytes,
    storage_path, uploaded_by, titular_user_id
  )
  VALUES (
    'd4c60f02-162e-4417-9a13-739ba6439f00'::uuid,
    '5511999990001',
    'smoke-fase-i.pdf',
    'application/pdf',
    1234,
    'b31a6a89-55a8-431b-b0c4-764071270390/5511999990001/smoke-fase-i-' || gen_random_uuid()::text || '.pdf',
    'eddba38d-fb2a-461c-997a-de91371cba65'::uuid,
    'b31a6a89-55a8-431b-b0c4-764071270390'::uuid
  )
  RETURNING id, storage_path
)
SELECT public.delete_paciente_documento_painel((SELECT id FROM ins)) AS test3_rpc,
       (SELECT id FROM ins) AS doc_id,
       (SELECT storage_path FROM ins) AS storage_path;

SELECT json_build_object(
  'metadado_archived', (
    SELECT pd.archived_at IS NOT NULL
       AND pd.archived_by = 'eddba38d-fb2a-461c-997a-de91371cba65'::uuid
    FROM public.paciente_documentos pd
    WHERE pd.file_name = 'smoke-fase-i.pdf'
    ORDER BY pd.created_at DESC
    LIMIT 1
  ),
  'audit', (
    SELECT cal.action FROM public.clinical_audit_log cal
    JOIN public.paciente_documentos pd ON pd.id = cal.record_id
    WHERE pd.file_name = 'smoke-fase-i.pdf'
    ORDER BY pd.created_at DESC
    LIMIT 1
  )
) AS test3_verify;
