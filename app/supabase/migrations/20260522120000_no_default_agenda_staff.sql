-- Não cria colaborador/barbeiro padrão quando a barbearia ainda não cadastrou staff.
-- A agenda operacional continua sendo criada, mas sem horários/serviços até existir colaborador real.

DELETE FROM public.barbeiros
WHERE staff_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.barbearias b
    WHERE b.id = barbeiros.barbearia_id
      AND EXISTS (
        SELECT 1
        FROM public.barbershops s
        WHERE s.slug = b.slug
          AND s.display_name = barbeiros.nome
      )
  );

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

  -- Remove apenas o colaborador sintético legado. Staff real sempre tem staff_id.
  DELETE FROM public.barbeiros
  WHERE barbearia_id = _barbearia_id
    AND staff_id IS NULL;

  FOR _staff IN
    SELECT id, name FROM public.staff
    WHERE barbershop_id = _shop.id AND is_active = true
    ORDER BY sort_order, name
  LOOP
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

  RETURN _barbearia_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_agenda_from_barbershop_slug(text) TO anon, authenticated;
