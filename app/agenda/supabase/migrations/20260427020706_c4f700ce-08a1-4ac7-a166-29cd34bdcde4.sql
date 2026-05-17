-- Função: listar agendamentos futuros do cliente por whatsapp + slug
CREATE OR REPLACE FUNCTION public.listar_agendamentos_cliente(_slug text, _whatsapp text)
RETURNS TABLE (
  id uuid,
  data date,
  hora time,
  duracao_minutos int,
  status agendamento_status,
  cliente_nome text,
  barbeiro_id uuid,
  barbeiro_nome text,
  barbearia_nome text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.data, a.hora, a.duracao_minutos, a.status,
         a.cliente_nome, a.barbeiro_id, bb.nome AS barbeiro_nome, b.nome AS barbearia_nome
  FROM public.agendamentos a
  JOIN public.barbearias b ON b.id = a.barbearia_id
  JOIN public.barbeiros bb ON bb.id = a.barbeiro_id
  WHERE b.slug = _slug
    AND b.ativa = true
    AND regexp_replace(COALESCE(a.cliente_whatsapp,''), '[^0-9]', '', 'g')
        = regexp_replace(COALESCE(_whatsapp,''), '[^0-9]', '', 'g')
    AND a.status = 'confirmado'
    AND (a.data > CURRENT_DATE OR (a.data = CURRENT_DATE AND a.hora >= CURRENT_TIME))
  ORDER BY a.data ASC, a.hora ASC;
$$;

-- Função: cancelar agendamento do cliente
CREATE OR REPLACE FUNCTION public.cancelar_agendamento_cliente(_slug text, _whatsapp text, _agendamento_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ok int;
BEGIN
  UPDATE public.agendamentos a
     SET status = 'cancelado'
    FROM public.barbearias b
   WHERE a.id = _agendamento_id
     AND a.barbearia_id = b.id
     AND b.slug = _slug
     AND b.ativa = true
     AND regexp_replace(COALESCE(a.cliente_whatsapp,''), '[^0-9]', '', 'g')
         = regexp_replace(COALESCE(_whatsapp,''), '[^0-9]', '', 'g')
     AND a.status = 'confirmado';
  GET DIAGNOSTICS _ok = ROW_COUNT;
  RETURN _ok > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_agendamentos_cliente(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_agendamento_cliente(text, text, uuid) TO anon, authenticated;