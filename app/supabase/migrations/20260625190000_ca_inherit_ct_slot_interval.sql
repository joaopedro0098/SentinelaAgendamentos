-- CA herda intervalo da grade do titular (CT/AA). ensure_agenda aplica slot_minutos do titular nos barbeiros da CA.

CREATE OR REPLACE FUNCTION public.effective_slot_interval_minutes_for_shop(p_shop_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT os.slot_interval_minutes
      FROM public.barbershops bs
      JOIN public.aggregated_accounts aa
        ON aa.aggregated_user_id = bs.owner_id
       AND aa.status = 'active'::public.aggregated_account_status
      JOIN public.barbershops os ON os.owner_id = aa.owner_user_id
      WHERE bs.id = p_shop_id
      LIMIT 1
    ),
    (
      SELECT bs.slot_interval_minutes
      FROM public.barbershops bs
      WHERE bs.id = p_shop_id
    ),
    30
  );
$$;

COMMENT ON FUNCTION public.effective_slot_interval_minutes_for_shop(uuid) IS
  'Intervalo efetivo da grade: CAs usam o do titular; demais contas usam o próprio.';

GRANT EXECUTE ON FUNCTION public.effective_slot_interval_minutes_for_shop(uuid) TO anon, authenticated;

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

  _slot_minutes := public.effective_slot_interval_minutes_for_shop(_shop.id);

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

COMMENT ON FUNCTION public.ensure_agenda_from_barbershop_slug(text) IS
  'Sincroniza barbearia/barbeiros da agenda. CAs recebem slot_minutos do titular (CT/AA).';
