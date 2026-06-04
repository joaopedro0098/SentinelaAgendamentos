-- Retenção de 2 meses: consultas só veem agendamentos dentro da janela;
-- alinhado com purge_old_agendamentos().

CREATE OR REPLACE FUNCTION public.agendamento_dentro_retencao(_data date)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT (_data + INTERVAL '2 months') >= (timezone('America/Sao_Paulo', now()))::date;
$$;

COMMENT ON FUNCTION public.agendamento_dentro_retencao(date) IS
  'True enquanto data + 2 meses >= hoje (America/Sao_Paulo). Fora disso o registro não deve ser consultável.';

DROP POLICY IF EXISTS "public reads agendamentos confirmados" ON public.agendamentos;
CREATE POLICY "public reads agendamentos confirmados" ON public.agendamentos
  FOR SELECT TO anon, authenticated
  USING (
    status = 'confirmado'::public.agendamento_status
    AND public.agendamento_dentro_retencao(data)
  );

DROP POLICY IF EXISTS "owner reads agendamentos" ON public.agendamentos;
CREATE POLICY "owner reads agendamentos" ON public.agendamentos
  FOR SELECT TO authenticated
  USING (
    public.agendamento_dentro_retencao(data)
    AND (
      EXISTS (
        SELECT 1 FROM public.barbearias b
        WHERE b.id = barbearia_id AND b.owner_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.barbearias b
        INNER JOIN public.barbershops s ON s.slug = b.slug
        WHERE b.id = barbearia_id AND s.owner_id = auth.uid()
      )
    )
  );

-- Cliente (link público): últimos 7 dias + futuros, sempre dentro da retenção.
CREATE OR REPLACE FUNCTION public.listar_agendamentos_cliente(_slug text, _whatsapp text)
RETURNS TABLE (
  id uuid,
  data date,
  hora time,
  duracao_minutos integer,
  barbeiro_id uuid,
  barbeiro_nome text,
  barbearia_nome text,
  cliente_nome text,
  status public.agendamento_status,
  servicos_nomes text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_id uuid;
  _digits text;
BEGIN
  _digits := regexp_replace(COALESCE(_whatsapp, ''), '\D', '', 'g');
  IF length(_digits) < 10 THEN
    RETURN;
  END IF;

  SELECT b.id INTO _barbearia_id
  FROM public.barbearias b
  WHERE b.slug = trim(_slug)
    AND b.ativa = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.data,
    a.hora,
    a.duracao_minutos,
    a.barbeiro_id,
    br.nome AS barbeiro_nome,
    bb.nome AS barbearia_nome,
    a.cliente_nome,
    a.status,
    COALESCE(a.servicos_nomes, ARRAY[]::text[])
  FROM public.agendamentos a
  JOIN public.barbeiros br ON br.id = a.barbeiro_id
  JOIN public.barbearias bb ON bb.id = a.barbearia_id
  WHERE a.barbearia_id = _barbearia_id
    AND a.status = 'confirmado'::public.agendamento_status
    AND a.data >= (CURRENT_DATE - 7)
    AND public.agendamento_dentro_retencao(a.data)
    AND regexp_replace(a.cliente_whatsapp, '\D', '', 'g') = _digits
  ORDER BY a.data ASC, a.hora ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.listar_agendamentos_cliente(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_agendamentos_cliente(text, text) TO anon, authenticated;
