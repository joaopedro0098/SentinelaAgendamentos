-- Corrige ON CONFLICT da ponte agenda (índice parcial em staff_id + slug sem UNIQUE legado)

CREATE UNIQUE INDEX IF NOT EXISTS barbearias_slug_unique ON public.barbearias (slug);

DROP INDEX IF EXISTS public.idx_barbeiros_staff_id;
CREATE UNIQUE INDEX IF NOT EXISTS barbeiros_staff_id_unique ON public.barbeiros (staff_id);

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
  _has_staff boolean := false;
BEGIN
  SELECT id, slug, display_name, avatar_url, owner_id
  INTO _shop
  FROM public.barbershops
  WHERE slug = trim(p_slug)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.barbearias (slug, nome, logo_url, owner_id, ativa)
  VALUES (_shop.slug, _shop.display_name, COALESCE(_shop.avatar_url, ''), _shop.owner_id, true)
  ON CONFLICT (slug) DO UPDATE SET
    nome = EXCLUDED.nome,
    logo_url = EXCLUDED.logo_url,
    owner_id = EXCLUDED.owner_id,
    ativa = true,
    updated_at = now()
  RETURNING id INTO _barbearia_id;

  FOR _staff IN
    SELECT id, name FROM public.staff
    WHERE barbershop_id = _shop.id AND is_active = true
    ORDER BY sort_order, name
  LOOP
    _has_staff := true;

    INSERT INTO public.barbeiros (barbearia_id, nome, ativo, staff_id, slot_minutos)
    VALUES (_barbearia_id, _staff.name, true, _staff.id, 30)
    ON CONFLICT (staff_id) DO UPDATE SET
      barbearia_id = EXCLUDED.barbearia_id,
      nome = EXCLUDED.nome,
      ativo = true
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

  IF NOT _has_staff THEN
    DELETE FROM public.barbeiros WHERE barbearia_id = _barbearia_id AND staff_id IS NULL;

    INSERT INTO public.barbeiros (barbearia_id, nome, ativo, slot_minutos)
    VALUES (_barbearia_id, _shop.display_name, true, 30)
    RETURNING id INTO _barbeiro_id;

    DELETE FROM public.barbeiro_services WHERE barbeiro_id = _barbeiro_id;
    INSERT INTO public.barbeiro_services (barbeiro_id, nome, duracao_minutos, ativo)
    VALUES (_barbeiro_id, 'Atendimento', 30, true);

    DELETE FROM public.disponibilidades WHERE barbeiro_id = _barbeiro_id;
    INSERT INTO public.disponibilidades (barbeiro_id, dia_semana, hora_inicio, hora_fim)
    SELECT _barbeiro_id, d, '09:00'::time, '18:00'::time
    FROM generate_series(1, 5) AS d;
  END IF;

  RETURN _barbearia_id;
END;
$$;
