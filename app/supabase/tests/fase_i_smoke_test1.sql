-- Fase I smoke test 1: archive concluido + cascata anotacao
SELECT set_config('request.jwt.claim.sub', 'eddba38d-fb2a-461c-997a-de91371cba65', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT public.excluir_agendamento_painel('0b64c066-0e87-483a-9540-836d150a9797'::uuid) AS test1_rpc;

SELECT json_build_object(
  'agendamento_archived', (
    SELECT a.archived_at IS NOT NULL AND a.archived_by = 'eddba38d-fb2a-461c-997a-de91371cba65'::uuid
    FROM public.agendamentos a WHERE a.id = '0b64c066-0e87-483a-9540-836d150a9797'
  ),
  'anotacao_archived', (
    SELECT an.archived_at IS NOT NULL AND an.archived_by = 'eddba38d-fb2a-461c-997a-de91371cba65'::uuid
    FROM public.agendamento_anotacoes an WHERE an.agendamento_id = '0b64c066-0e87-483a-9540-836d150a9797'
  ),
  'audit_count', (
    SELECT count(*)::int FROM public.clinical_audit_log cal
    WHERE cal.record_id IN (
      '0b64c066-0e87-483a-9540-836d150a9797'::uuid,
      '33f187df-19be-4653-a079-6862ecdfe6b5'::uuid
    ) AND cal.action = 'archive'
  )
) AS test1_verify;
