-- CT: todos os pacientes de todas as CAs ativas na aba Pacientes (filtro por profissional).
-- CT: nunca cria/edita anotação de atendimento CA (só visualiza se toggle de anotações ativo).

CREATE OR REPLACE FUNCTION public.painel_barbearia_ids_pacientes_visiveis()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT v.id), ARRAY[]::uuid[])
  FROM (
    SELECT b.id
    FROM public.barbearias b
    JOIN public.barbershops s ON s.slug = b.slug
    WHERE s.owner_id = auth.uid()

    UNION

    SELECT b.id
    FROM public.aggregated_accounts aa
    JOIN public.barbershops cs ON cs.owner_id = aa.aggregated_user_id
    JOIN public.barbearias b ON b.slug = cs.slug
    WHERE aa.owner_user_id = auth.uid()
      AND aa.status = 'active'::public.aggregated_account_status
      AND NOT EXISTS (
        SELECT 1
        FROM public.aggregated_accounts self
        WHERE self.aggregated_user_id = auth.uid()
          AND self.status = 'active'::public.aggregated_account_status
      )
  ) v
  WHERE v.id IS NOT NULL;
$$;

COMMENT ON FUNCTION public.painel_barbearia_ids_pacientes_visiveis() IS
  'Barbearias cujos pacientes aparecem na aba Pacientes: própria + todas as CAs ativas do titular.';

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
    JOIN public.barbershops shop ON shop.slug = b.slug
    JOIN public.barbeiros br ON br.id = a.barbeiro_id
    JOIN public.barbearias prof_b ON prof_b.id = br.barbearia_id
    JOIN public.barbershops prof_shop ON prof_shop.slug = prof_b.slug
    WHERE a.id = p_agendamento_id
      AND a.status = 'concluido'::public.agendamento_status
      AND shop.owner_id = auth.uid()
      AND prof_shop.owner_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.painel_pode_escrever_anotacao(uuid) IS
  'Escrita de anotação: dono direto da barbearia do agendamento e do profissional. Titular nunca escreve em atendimento CA.';
