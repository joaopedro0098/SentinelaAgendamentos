-- Migration: Adiciona auth_user_id em public.clientes e atualiza políticas de RLS
-- para exigir autenticação e proibir acesso anônimo aos dados de pacientes.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_auth_user_id ON public.clientes(auth_user_id);

COMMENT ON COLUMN public.clientes.auth_user_id IS
  'ID da conta de autenticação (auth.users) do paciente. Preenchido na ativação de conta por WhatsApp/e-mail.';

-- 1. Atualização da nomenclatura da coluna origem em public.agendamentos ('link_publico' -> 'paciente_logado')
ALTER TABLE public.agendamentos DROP CONSTRAINT IF EXISTS agendamentos_origem_check;

UPDATE public.agendamentos
SET origem = 'paciente_logado'
WHERE origem = 'link_publico';

ALTER TABLE public.agendamentos
  ALTER COLUMN origem SET DEFAULT 'paciente_logado',
  ADD CONSTRAINT agendamentos_origem_check CHECK (origem IN ('paciente_logado', 'painel'));

COMMENT ON COLUMN public.agendamentos.origem IS
  'paciente_logado = paciente autenticado no agendamento; painel = profissional no /app/agendar';

-- 2. Desativa políticas anônimas em public.clientes
DROP POLICY IF EXISTS "public insere cliente em barbearia ativa" ON public.clientes;
DROP POLICY IF EXISTS "anon reads clientes booking" ON public.clientes;

-- 3. Leitura de paciente autenticado (lê seus próprios cadastros de paciente vinculados via auth_user_id)
DROP POLICY IF EXISTS "paciente reads own cliente record" ON public.clientes;
CREATE POLICY "paciente reads own cliente record"
  ON public.clientes FOR SELECT TO authenticated
  USING (archived_at IS NULL AND auth_user_id = auth.uid());

COMMENT ON POLICY "paciente reads own cliente record" ON public.clientes IS
  'Paciente logado pode ler seus próprios registros de cliente (nas clínicas onde está cadastrado).';

-- 4. Inserção pelo profissional no painel
DROP POLICY IF EXISTS "owner inserts cliente painel" ON public.clientes;
CREATE POLICY "owner inserts cliente painel"
  ON public.clientes FOR INSERT TO authenticated
  WITH CHECK (
    archived_at IS NULL
    AND (
      titular_user_id = public.painel_titular_user_id()
      OR barbearia_id = ANY(public.painel_barbearia_ids_pacientes_visiveis())
    )
  );

COMMENT ON POLICY "owner inserts cliente painel" ON public.clientes IS
  'Profissional/CA autenticado pode cadastrar novos pacientes para as clínicas visíveis do seu tenant.';

-- 5. Atualização de políticas de inserção em agendamentos (paciente logado)
DROP POLICY IF EXISTS "public insere agendamento" ON public.agendamentos;
DROP POLICY IF EXISTS "paciente insere agendamento proprio" ON public.agendamentos;
CREATE POLICY "paciente insere agendamento proprio"
  ON public.agendamentos FOR INSERT TO authenticated
  WITH CHECK (
    archived_at IS NULL
    AND (origem IS NULL OR origem = 'paciente_logado')
    AND status = 'confirmado'::public.agendamento_status
    AND public.barbearia_pode_agendar(barbearia_id)
    AND cliente_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.clientes c
      WHERE c.id = agendamentos.cliente_id
        AND c.auth_user_id = auth.uid()
        AND c.barbearia_id = agendamentos.barbearia_id
    )
  );

COMMENT ON POLICY "paciente insere agendamento proprio" ON public.agendamentos IS
  'Paciente autenticado só pode agendar se o cliente_id pertencer à sua conta auth_user_id na clínica correspondente.';
