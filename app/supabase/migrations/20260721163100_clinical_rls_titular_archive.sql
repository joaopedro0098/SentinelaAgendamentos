-- Fase K: RLS clínico alinhado à Fase H (titular_user_id + archived_at IS NULL).
-- Complemento às RPCs SECURITY DEFINER — protege acesso direto PostgREST (anon/authenticated).
-- Prioridade: fechar vazamento cross-tenant em clientes SELECT authenticated.
-- agendamento_anotacoes: deny total mantido (RPC-only).
-- Storage: remove DELETE físico de blob (Fase I — archive preserva arquivo).

-- =============================================================================
-- clientes
-- =============================================================================

DROP POLICY IF EXISTS "public reads clientes de barbearia ativa" ON public.clientes;

-- Link público (anon): barbearia ativa, sem escopo titular — booking precisa resolver whatsapp.
CREATE POLICY "anon reads clientes booking"
  ON public.clientes FOR SELECT TO anon
  USING (
    archived_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.barbearias b
      WHERE b.id = clientes.barbearia_id AND b.ativa = true
    )
  );

COMMENT ON POLICY "anon reads clientes booking" ON public.clientes IS
  'Link público: lê cadastro da barbearia ativa. Sem titular_user_id (anon). Exclui arquivados.';

-- Painel (authenticated): escopo titular Fase H — fecha vazamento cross-tenant.
CREATE POLICY "owner reads clientes painel"
  ON public.clientes FOR SELECT TO authenticated
  USING (
    archived_at IS NULL
    AND titular_user_id = public.painel_titular_user_id()
    AND (
      (barbearia_id IS NULL AND titular_user_id = auth.uid())
      OR barbearia_id = ANY(public.painel_barbearia_ids_pacientes_visiveis())
    )
  );

COMMENT ON POLICY "owner reads clientes painel" ON public.clientes IS
  'Painel: titular_user_id + archived_at IS NULL + híbrido órfão. Substitui policy pública que vazava entre tenants.';

DROP POLICY IF EXISTS "public insere cliente em barbearia ativa" ON public.clientes;
CREATE POLICY "public insere cliente em barbearia ativa"
  ON public.clientes FOR INSERT TO anon, authenticated
  WITH CHECK (
    archived_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.barbearias b
      WHERE b.id = clientes.barbearia_id AND b.ativa = true
    )
  );

-- UPDATE / DELETE: sem policy → deny implícito (archive via RPC).

-- =============================================================================
-- agendamentos
-- =============================================================================

DROP POLICY IF EXISTS "owner reads agendamentos" ON public.agendamentos;
CREATE POLICY "owner reads agendamentos"
  ON public.agendamentos FOR SELECT TO authenticated
  USING (
    archived_at IS NULL
    AND titular_user_id = public.painel_titular_user_id()
    AND (
      (barbearia_id IS NULL AND titular_user_id = auth.uid())
      OR barbearia_id = ANY(public.painel_barbearia_ids_visiveis())
    )
  );

COMMENT ON POLICY "owner reads agendamentos" ON public.agendamentos IS
  'Painel: titular + archived_at (sem agendamento_dentro_retencao). Híbrido órfão barbearia_id NULL.';

DROP POLICY IF EXISTS "public reads agendamentos confirmados" ON public.agendamentos;
CREATE POLICY "public reads agendamentos confirmados"
  ON public.agendamentos FOR SELECT TO anon, authenticated
  USING (
    archived_at IS NULL
    AND public.agendamento_dentro_retencao(data)
    AND (
      status = 'confirmado'::public.agendamento_status
      OR (
        status = 'aguardando_pagamento'::public.agendamento_status
        AND payment_expires_at IS NOT NULL
        AND payment_expires_at >= now()
      )
    )
  );

COMMENT ON POLICY "public reads agendamentos confirmados" ON public.agendamentos IS
  'Grade de slots / link público: confirmados + holds ativos. Retenção pública; exclui arquivados.';

DROP POLICY IF EXISTS "owner updates agendamentos" ON public.agendamentos;
CREATE POLICY "owner updates agendamentos"
  ON public.agendamentos FOR UPDATE TO authenticated
  USING (
    archived_at IS NULL
    AND titular_user_id = public.painel_titular_user_id()
    AND (
      (barbearia_id IS NULL AND titular_user_id = auth.uid())
      OR barbearia_id = ANY(public.painel_barbearia_ids_agendamentos_editaveis())
    )
  )
  WITH CHECK (
    archived_at IS NULL
    AND titular_user_id = public.painel_titular_user_id()
    AND (
      (barbearia_id IS NULL AND titular_user_id = auth.uid())
      OR barbearia_id = ANY(public.painel_barbearia_ids_agendamentos_editaveis())
    )
  );

COMMENT ON POLICY "owner updates agendamentos" ON public.agendamentos IS
  'Painel: UPDATE operacional direto (PostgREST). Archive bloqueado (WITH CHECK archived_at IS NULL).';

DROP POLICY IF EXISTS "owner inserts agendamento painel" ON public.agendamentos;
CREATE POLICY "owner inserts agendamento painel"
  ON public.agendamentos FOR INSERT TO authenticated
  WITH CHECK (
    archived_at IS NULL
    AND origem = 'painel'
    AND status = 'confirmado'::public.agendamento_status
    AND public.barbearia_pode_agendar(barbearia_id)
    AND barbearia_id = ANY(public.painel_barbearia_ids_agendamentos_editaveis())
  );

DROP POLICY IF EXISTS "public insere agendamento" ON public.agendamentos;
CREATE POLICY "public insere agendamento"
  ON public.agendamentos FOR INSERT TO anon, authenticated
  WITH CHECK (
    archived_at IS NULL
    AND (origem IS NULL OR origem = 'link_publico')
    AND public.barbearia_pode_agendar(barbearia_id)
    AND status = 'confirmado'::public.agendamento_status
    AND public.barbearia_allows_public_booking_insert(barbearia_id)
  );

-- DELETE: sem policy → deny implícito (hold DELETE físico = RPC/cron SECURITY DEFINER).

-- agendamento_anotacoes: RLS habilitado, zero policies — deny total, RPC-only (sem alteração).

-- =============================================================================
-- paciente_documentos
-- =============================================================================

DROP POLICY IF EXISTS "paciente_documentos_delete_painel" ON public.paciente_documentos;

DROP POLICY IF EXISTS paciente_documentos_select_painel ON public.paciente_documentos;
CREATE POLICY paciente_documentos_select_painel
  ON public.paciente_documentos FOR SELECT TO authenticated
  USING (
    archived_at IS NULL
    AND titular_user_id = public.painel_titular_user_id()
    AND (
      (barbearia_id IS NULL AND titular_user_id = auth.uid())
      OR barbearia_id = ANY(public.painel_barbearia_ids_pacientes_visiveis())
    )
  );

COMMENT ON POLICY paciente_documentos_select_painel ON public.paciente_documentos IS
  'Painel: titular + archived_at. DELETE físico bloqueado — archive via delete_paciente_documento_painel RPC.';

-- INSERT / UPDATE / DELETE (tabela): sem policy → deny implícito.

-- =============================================================================
-- storage.objects — Fase I: blob preservado após archive (sem storage.remove direto)
-- =============================================================================

DROP POLICY IF EXISTS paciente_documentos_delete_own ON storage.objects;

-- (Sem COMMENT ON POLICY em storage.objects — schema storage exige owner supabase_storage_admin.)

-- Smoke pós-push (manual):
-- 1. anon PublicBooking: SELECT agendamentos ocupados + INSERT confirmado OK
-- 2. authenticated createPanelSlotBooking / Agendar ownerPanel: INSERT agendamentos origem=painel OK
-- 3. CA logada: SELECT clientes WHERE titular = CT AND barbearia visível OK; outro tenant negado
-- 4. list_paciente_documentos RPC OK; SELECT direto paciente_documentos respeita titular
-- 5. DELETE paciente_documentos / storage.remove paciente-documentos → 403
