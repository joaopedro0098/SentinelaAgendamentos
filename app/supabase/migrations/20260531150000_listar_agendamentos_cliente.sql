-- Lista agendamentos futuros do cliente pelo WhatsApp (link público).

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
    AND a.data >= CURRENT_DATE
    AND regexp_replace(a.cliente_whatsapp, '\D', '', 'g') = _digits
  ORDER BY a.data ASC, a.hora ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.listar_agendamentos_cliente(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_agendamentos_cliente(text, text) TO anon, authenticated;
