-- Pagamentos MP: cancelamentos automáticos (expiração 15 min, falha MP) usam cancelado_por = 'sistema'.

ALTER TABLE public.agendamentos
  DROP CONSTRAINT IF EXISTS agendamentos_cancelado_por_check;

ALTER TABLE public.agendamentos
  ADD CONSTRAINT agendamentos_cancelado_por_check
  CHECK (cancelado_por IS NULL OR cancelado_por IN ('cliente', 'profissional', 'sistema'));

COMMENT ON COLUMN public.agendamentos.cancelado_por IS
  'Quem cancelou: cliente (link público), profissional (painel) ou sistema (expiração/falha de pagamento).';

CREATE OR REPLACE FUNCTION public.agendamento_cancelado_por(
  p_cancelado_por text,
  p_origem text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_cancelado_por IN ('cliente', 'profissional', 'sistema') THEN p_cancelado_por
    WHEN p_origem = 'link_publico' THEN 'cliente'
    ELSE 'profissional'
  END;
$$;
