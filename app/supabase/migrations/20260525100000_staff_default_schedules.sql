-- Horários padrão (seg–sex 09:00–18:00) ao criar colaborador + backfill dos existentes.

CREATE OR REPLACE FUNCTION public.seed_default_staff_schedules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.staff_schedules (staff_id, day_of_week, start_time, end_time)
  VALUES
    (NEW.id, 1, '09:00', '18:00'),
    (NEW.id, 2, '09:00', '18:00'),
    (NEW.id, 3, '09:00', '18:00'),
    (NEW.id, 4, '09:00', '18:00'),
    (NEW.id, 5, '09:00', '18:00')
  ON CONFLICT (staff_id, day_of_week) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_default_schedules ON public.staff;
CREATE TRIGGER trg_staff_default_schedules
AFTER INSERT ON public.staff
FOR EACH ROW
EXECUTE FUNCTION public.seed_default_staff_schedules();

-- Colaboradores antigos criados sem horários
INSERT INTO public.staff_schedules (staff_id, day_of_week, start_time, end_time)
SELECT s.id, d.day_of_week, '09:00'::time, '18:00'::time
FROM public.staff s
CROSS JOIN (VALUES (1), (2), (3), (4), (5)) AS d(day_of_week)
WHERE NOT EXISTS (
  SELECT 1 FROM public.staff_schedules sch WHERE sch.staff_id = s.id
)
ON CONFLICT (staff_id, day_of_week) DO NOTHING;
