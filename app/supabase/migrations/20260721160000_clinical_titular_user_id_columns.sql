-- Fase A (titularidade CT/CA): titular_user_id — dono clínico definitivo (CT custodiante).
-- Nullable por ora; preenchido no backfill (próxima migration) e, a partir da Fase H
-- (ainda não implementada), gravado na criação de cada registro pelas RPCs.
-- Não é retroativo: uma vez setado, não muda quando o vínculo CT/CA muda depois
-- (decisão de negócio confirmada — dado gerado durante agregação fica com a CT para sempre).
--
-- ON DELETE SET NULL (não RESTRICT): delete-account/admin-purge-user ainda fazem hard delete
-- físico das linhas antes de deletar o auth.users (comportamento inalterado nesta fase).
-- Revisitar para RESTRICT quando essas funções forem reescritas (Fase F+) para nunca mais
-- apagar fisicamente dado clínico — aí sim a FK pode reforçar isso no nível do banco.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS titular_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS titular_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.agendamento_anotacoes
  ADD COLUMN IF NOT EXISTS titular_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.paciente_documentos
  ADD COLUMN IF NOT EXISTS titular_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.clientes.titular_user_id IS
  'Dono clínico definitivo (CT custodiante). Setado na criação; não muda retroativamente quando o vínculo CT/CA muda.';
COMMENT ON COLUMN public.agendamentos.titular_user_id IS
  'Dono clínico definitivo (CT custodiante). Setado na criação; não muda retroativamente quando o vínculo CT/CA muda.';
COMMENT ON COLUMN public.agendamento_anotacoes.titular_user_id IS
  'Dono clínico definitivo (CT custodiante). Setado na criação; não muda retroativamente quando o vínculo CT/CA muda.';
COMMENT ON COLUMN public.paciente_documentos.titular_user_id IS
  'Dono clínico definitivo (CT custodiante). Setado na criação; não muda retroativamente quando o vínculo CT/CA muda.';
