-- Intervalo e pausa da grade de horários (nível barbearia / barbershop)

ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS slot_interval_minutes int NOT NULL DEFAULT 30
    CHECK (slot_interval_minutes >= 5 AND slot_interval_minutes <= 120),
  ADD COLUMN IF NOT EXISTS slot_pause_minutes int NOT NULL DEFAULT 0
    CHECK (slot_pause_minutes >= 0 AND slot_pause_minutes <= 60);

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
  SELECT id, slug, display_name, avatar_url, owner_id, slot_interval_minutes
  INTO _shop
  FROM public.barbershops
  WHERE slug = trim(p_slug)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  _slot_minutes := COALESCE(_shop.slot_interval_minutes, 30);

  INSERT INTO public.barbearias (slug, nome, logo_url, owner_id, ativa)
  VALUES (_shop.slug, _shop.display_name, COALESCE(_shop.avatar_url, ''), _shop.owner_id, true)
  ON CONFLICT (slug) DO UPDATE SET
    nome = EXCLUDED.nome,
    logo_url = EXCLUDED.logo_url,
    owner_id = EXCLUDED.owner_id,
    ativa = true,
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
    INSERT INTO public.barbeiro_services (barbeiro_id, nome, duracao_minutos, ativo)
    SELECT _barbeiro_id, ss.name, ss.duration_minutes, true
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

GRANT EXECUTE ON FUNCTION public.ensure_agenda_from_barbershop_slug(text) TO anon, authenticated;
