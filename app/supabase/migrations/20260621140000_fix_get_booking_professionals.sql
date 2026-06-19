-- Corrige get_booking_professionals: VOLATILE (ensure_agenda altera dados),
-- retorno jsonb e IDs alinhados com client_hub_barbearia_ids_for_slug.

DROP FUNCTION IF EXISTS public.get_booking_professionals(text, date, date);

CREATE OR REPLACE FUNCTION public.get_booking_professionals(
  p_slug text,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hub_slug text;
  _shop record;
  _is_ca boolean;
  _ca_slug text;
  _barbearia_ids uuid[];
  _result jsonb;
BEGIN
  _hub_slug := trim(p_slug);
  IF _hub_slug = '' THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT * INTO _shop
  FROM public.barbershops
  WHERE slug = _hub_slug
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN '[]'::jsonb;
  END IF;

  _is_ca := EXISTS (
    SELECT 1
    FROM public.aggregated_accounts aa
    WHERE aa.aggregated_user_id = _shop.owner_id
      AND aa.status = 'active'::public.aggregated_account_status
  );

  PERFORM public.ensure_agenda_from_barbershop_slug(_hub_slug);

  IF NOT _is_ca THEN
    FOR _ca_slug IN
      SELECT cs.slug
      FROM public.aggregated_accounts aa
      JOIN public.barbershops cs ON cs.owner_id = aa.aggregated_user_id
      WHERE aa.owner_user_id = _shop.owner_id
        AND aa.status = 'active'::public.aggregated_account_status
    LOOP
      PERFORM public.ensure_agenda_from_barbershop_slug(_ca_slug);
    END LOOP;
  END IF;

  _barbearia_ids := public.client_hub_barbearia_ids_for_slug(_hub_slug);

  IF _barbearia_ids IS NULL OR cardinality(_barbearia_ids) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(row ORDER BY source_order, nome), '[]'::jsonb)
  INTO _result
  FROM (
    SELECT
      br.id AS barbeiro_id,
      br.barbearia_id,
      br.nome,
      br.foto_url,
      COALESCE(br.slot_minutos, 30) AS slot_minutos,
      CASE WHEN bb.slug <> _hub_slug THEN 1 ELSE 0 END AS source_order,
      (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'dia_semana', d.dia_semana,
          'hora_inicio', d.hora_inicio,
          'hora_fim', d.hora_fim
        ) ORDER BY d.dia_semana, d.hora_inicio), '[]'::jsonb)
        FROM public.disponibilidades d
        WHERE d.barbeiro_id = br.id
      ) AS disponibilidades,
      (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'data', bl.data,
          'hora_inicio', bl.hora_inicio,
          'hora_fim', bl.hora_fim
        ) ORDER BY bl.data), '[]'::jsonb)
        FROM public.bloqueios bl
        WHERE bl.barbeiro_id = br.id
          AND (p_from IS NULL OR bl.data >= p_from)
          AND (p_to IS NULL OR bl.data <= p_to)
      ) AS bloqueios,
      (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', bs.id,
          'nome', bs.nome,
          'duracao_minutos', bs.duracao_minutos
        ) ORDER BY bs.nome), '[]'::jsonb)
        FROM public.barbeiro_services bs
        WHERE bs.barbeiro_id = br.id
          AND bs.ativo = true
      ) AS servicos
    FROM public.barbeiros br
    JOIN public.barbearias bb ON bb.id = br.barbearia_id
    WHERE br.barbearia_id = ANY(_barbearia_ids)
      AND br.ativo = true
  ) row;

  RETURN COALESCE(_result, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_booking_professionals(text, date, date) IS
  'Profissionais para agendamento: hub CT/AA inclui colaboradores das CAs ativas; CA usa só os próprios.';

GRANT EXECUTE ON FUNCTION public.get_booking_professionals(text, date, date) TO anon, authenticated;

-- ct_list_ca_info: inclui CAs mesmo antes da primeira sync em barbearias
CREATE OR REPLACE FUNCTION public.ct_list_ca_info()
RETURNS TABLE (barbearia_id uuid, slug text, shop_display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id, s.slug, s.display_name
  FROM public.aggregated_accounts aa
  JOIN public.barbershops s ON s.owner_id = aa.aggregated_user_id
  LEFT JOIN public.barbearias b ON b.slug = s.slug AND b.ativa = true
  WHERE aa.owner_user_id = auth.uid()
    AND aa.status = 'active'::public.aggregated_account_status;
$$;

GRANT EXECUTE ON FUNCTION public.ct_list_ca_info() TO authenticated;
