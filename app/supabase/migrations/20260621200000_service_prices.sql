-- Preço por serviço + toggle para exibir na agenda (painel e link público)

ALTER TABLE public.staff_services
  ADD COLUMN IF NOT EXISTS price_cents int NOT NULL DEFAULT 0
  CHECK (price_cents >= 0 AND price_cents <= 99999999);

ALTER TABLE public.barbeiro_services
  ADD COLUMN IF NOT EXISTS preco_centavos int NOT NULL DEFAULT 0
  CHECK (preco_centavos >= 0 AND preco_centavos <= 99999999);

ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS show_service_prices boolean NOT NULL DEFAULT false;

ALTER TABLE public.barbearias
  ADD COLUMN IF NOT EXISTS show_service_prices boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.staff_services.price_cents IS
  'Preço do serviço em centavos (0 = não exibir).';
COMMENT ON COLUMN public.barbeiro_services.preco_centavos IS
  'Espelho do preço do serviço (centavos) para a agenda pública.';
COMMENT ON COLUMN public.barbershops.show_service_prices IS
  'Exibe preços dos serviços na agenda interna e no link público.';
COMMENT ON COLUMN public.barbearias.show_service_prices IS
  'Espelho de show_service_prices da barbershop.';

UPDATE public.barbearias b
SET show_service_prices = bs.show_service_prices
FROM public.barbershops bs
WHERE bs.slug = b.slug;

CREATE OR REPLACE FUNCTION public.set_show_service_prices(p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _slug text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT bs.slug INTO _slug
  FROM public.barbershops bs
  WHERE bs.owner_id = auth.uid()
  LIMIT 1;

  IF _slug IS NULL THEN
    RAISE EXCEPTION 'Barbearia não encontrada';
  END IF;

  UPDATE public.barbershops
  SET show_service_prices = p_enabled
  WHERE slug = _slug AND owner_id = auth.uid();

  UPDATE public.barbearias
  SET show_service_prices = p_enabled, updated_at = now()
  WHERE slug = _slug;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_show_service_prices(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_agenda_from_barbershop_slug(p_slug text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shop record;
  _barbearia_id uuid;
  _staff record;
  _barbeiro_id uuid;
  _slot_minutes int;
BEGIN
  SELECT
    id,
    slug,
    display_name,
    avatar_url,
    owner_id,
    slot_interval_minutes,
    allow_client_self_service,
    allow_client_public_booking,
    show_service_prices
  INTO _shop
  FROM public.barbershops
  WHERE slug = trim(p_slug)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  _slot_minutes := COALESCE(_shop.slot_interval_minutes, 30);

  INSERT INTO public.barbearias (
    slug,
    nome,
    logo_url,
    owner_id,
    ativa,
    allow_client_self_service,
    allow_client_public_booking,
    show_service_prices
  )
  VALUES (
    _shop.slug,
    _shop.display_name,
    COALESCE(_shop.avatar_url, ''),
    _shop.owner_id,
    true,
    COALESCE(_shop.allow_client_self_service, true),
    COALESCE(_shop.allow_client_public_booking, true),
    COALESCE(_shop.show_service_prices, false)
  )
  ON CONFLICT (slug) DO UPDATE SET
    nome = EXCLUDED.nome,
    logo_url = EXCLUDED.logo_url,
    owner_id = EXCLUDED.owner_id,
    ativa = true,
    allow_client_self_service = EXCLUDED.allow_client_self_service,
    allow_client_public_booking = EXCLUDED.allow_client_public_booking,
    show_service_prices = EXCLUDED.show_service_prices,
    updated_at = now()
  RETURNING id INTO _barbearia_id;

  DELETE FROM public.barbeiros
  WHERE barbearia_id = _barbearia_id
    AND staff_id IS NULL;

  FOR _staff IN
    SELECT id, name FROM public.staff
    WHERE barbershop_id = _shop.id AND is_active = true
    ORDER BY sort_order, name
  LOOP
    INSERT INTO public.barbeiros (barbearia_id, nome, ativo, staff_id, slot_minutos)
    VALUES (_barbearia_id, _staff.name, true, _staff.id, _slot_minutes)
    ON CONFLICT (staff_id) DO UPDATE SET
      barbearia_id = EXCLUDED.barbearia_id,
      nome = EXCLUDED.nome,
      ativo = true,
      slot_minutos = EXCLUDED.slot_minutos
    RETURNING id INTO _barbeiro_id;

    DELETE FROM public.barbeiro_services WHERE barbeiro_id = _barbeiro_id;
    INSERT INTO public.barbeiro_services (barbeiro_id, nome, duracao_minutos, preco_centavos, ativo)
    SELECT _barbeiro_id, ss.name, ss.duration_minutes, COALESCE(ss.price_cents, 0), true
    FROM public.staff_services ss
    WHERE ss.staff_id = _staff.id;

    DELETE FROM public.disponibilidades WHERE barbeiro_id = _barbeiro_id;
    INSERT INTO public.disponibilidades (barbeiro_id, dia_semana, hora_inicio, hora_fim)
    SELECT _barbeiro_id, sch.day_of_week, sch.start_time, sch.end_time
    FROM public.staff_schedules sch
    WHERE sch.staff_id = _staff.id;
  END LOOP;

  RETURN _barbearia_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_booking_professionals(
  p_slug text,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hub_slug text := trim(p_slug);
  _barbearia_ids uuid[];
  _result jsonb;
BEGIN
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
          'duracao_minutos', bs.duracao_minutos,
          'preco_centavos', COALESCE(bs.preco_centavos, 0)
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

GRANT EXECUTE ON FUNCTION public.get_booking_professionals(text, date, date) TO anon, authenticated;
