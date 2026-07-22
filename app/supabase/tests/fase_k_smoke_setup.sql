-- Fase K smoke: discover test fixtures (read-only)
SELECT 'policies' AS section, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('clientes','agendamentos','paciente_documentos')
ORDER BY tablename, cmd;

SELECT 'storage_delete_policy' AS section,
       count(*) FILTER (WHERE policyname = 'paciente_documentos_delete_own') AS delete_own_exists
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects';

-- CT / CA from prior smoke tests
SELECT 'accounts' AS section,
       u.id, u.email,
       bs.slug AS shop_slug,
       b.id AS barbearia_id,
       b.ativa
FROM auth.users u
LEFT JOIN public.barbershops bs ON bs.owner_id = u.id
LEFT JOIN public.barbearias b ON b.slug = bs.slug
WHERE u.id IN (
  'b31a6a89-55a8-431b-b0c4-764071270390'::uuid,
  'eddba38d-fb2a-461c-997a-de91371cba65'::uuid
);

-- Sample barbeiro for CT barbearia
SELECT 'ct_barbeiro' AS section, br.id AS barbeiro_id, br.barbearia_id, br.nome, br.ativo
FROM public.barbeiros br
JOIN public.barbearias b ON b.id = br.barbearia_id
JOIN public.barbershops bs ON bs.slug = b.slug
WHERE bs.owner_id = 'b31a6a89-55a8-431b-b0c4-764071270390'::uuid
  AND br.ativo = true
LIMIT 3;

-- Cliente owned by CT titular
SELECT 'ct_cliente' AS section, c.id, c.barbearia_id, c.titular_user_id, c.archived_at IS NULL AS active
FROM public.clientes c
WHERE c.titular_user_id = 'b31a6a89-55a8-431b-b0c4-764071270390'::uuid
  AND c.archived_at IS NULL
LIMIT 3;

-- Cliente from different titular (if any)
SELECT 'other_tenant_cliente' AS section, c.id, c.barbearia_id, c.titular_user_id, c.nome
FROM public.clientes c
WHERE c.titular_user_id IS DISTINCT FROM 'b31a6a89-55a8-431b-b0c4-764071270390'::uuid
  AND c.archived_at IS NULL
  AND c.barbearia_id IS NOT NULL
LIMIT 3;

-- Agendamento confirmado for grid read (anon)
SELECT 'grid_agendamento' AS section, a.id, a.barbeiro_id, a.data, a.status, a.archived_at IS NULL AS active
FROM public.agendamentos a
WHERE a.archived_at IS NULL
  AND a.status IN ('confirmado','aguardando_pagamento')
  AND a.data >= CURRENT_DATE
LIMIT 3;

-- paciente_documentos sample
SELECT 'doc' AS section, pd.id, pd.titular_user_id, pd.uploaded_by, pd.archived_at IS NULL AS active
FROM public.paciente_documentos pd
WHERE pd.archived_at IS NULL
LIMIT 3;

-- whatsapp with docs for RPC test
SELECT 'doc_whatsapp' AS section, pd.whatsapp_digits, count(*) AS n
FROM public.paciente_documentos pd
WHERE pd.archived_at IS NULL
GROUP BY pd.whatsapp_digits
LIMIT 3;
