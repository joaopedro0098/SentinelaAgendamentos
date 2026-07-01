-- CT/AA titular: anotações de CA agregada são somente leitura (mesmo com owner_can_edit_appointments).

CREATE OR REPLACE FUNCTION public.painel_agendamento_e_de_ca_agregada(p_agendamento_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agendamentos a
    JOIN public.barbearias ag_bb ON ag_bb.id = a.barbearia_id
    JOIN public.barbershops ag_shop ON ag_shop.slug = ag_bb.slug
    JOIN public.aggregated_accounts aa
      ON aa.aggregated_user_id = ag_shop.owner_id
     AND aa.status = 'active'::public.aggregated_account_status
    WHERE a.id = p_agendamento_id
      AND aa.owner_user_id = auth.uid()
      AND ag_shop.owner_id IS DISTINCT FROM auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.agendamentos a
    JOIN public.barbeiros br ON br.id = a.barbeiro_id
    JOIN public.barbearias prof_bb ON prof_bb.id = br.barbearia_id
    JOIN public.barbershops prof_shop ON prof_shop.slug = prof_bb.slug
    JOIN public.aggregated_accounts aa
      ON aa.aggregated_user_id = prof_shop.owner_id
     AND aa.status = 'active'::public.aggregated_account_status
    WHERE a.id = p_agendamento_id
      AND aa.owner_user_id = auth.uid()
      AND prof_shop.owner_id IS DISTINCT FROM auth.uid()
  );
$$;

COMMENT ON FUNCTION public.painel_agendamento_e_de_ca_agregada(uuid) IS
  'True quando o agendamento pertence a uma CA agregada ao titular logado (somente leitura de anotações).';

GRANT EXECUTE ON FUNCTION public.painel_agendamento_e_de_ca_agregada(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.painel_pode_escrever_anotacao(p_agendamento_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agendamentos a
    JOIN public.barbearias b ON b.id = a.barbearia_id
    JOIN public.barbershops s ON s.slug = b.slug
    WHERE a.id = p_agendamento_id
      AND a.status = 'concluido'::public.agendamento_status
      AND s.owner_id = auth.uid()
  )
  AND NOT public.painel_agendamento_e_de_ca_agregada(p_agendamento_id);
$$;

COMMENT ON FUNCTION public.painel_pode_escrever_anotacao(uuid) IS
  'Escrita de anotação: dono direto da barbearia + concluído. Titular nunca escreve anotações de CA agregada.';
