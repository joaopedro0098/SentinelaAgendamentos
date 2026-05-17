-- Colaboradores, serviços (com duração) e horários de atendimento por colaborador

CREATE TABLE public.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id uuid NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_name_len CHECK (char_length(trim(name)) >= 1 AND char_length(name) <= 80)
);

CREATE INDEX idx_staff_barbershop ON public.staff(barbershop_id);

CREATE TABLE public.staff_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  name text NOT NULL,
  duration_minutes int NOT NULL DEFAULT 30,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_services_name_len CHECK (char_length(trim(name)) >= 1 AND char_length(name) <= 120),
  CONSTRAINT staff_services_duration CHECK (duration_minutes > 0 AND duration_minutes <= 480),
  UNIQUE (staff_id, name)
);

CREATE INDEX idx_staff_services_staff ON public.staff_services(staff_id);

CREATE TABLE public.staff_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_schedules_day CHECK (day_of_week >= 0 AND day_of_week <= 6),
  CONSTRAINT staff_schedules_hours CHECK (end_time > start_time),
  UNIQUE (staff_id, day_of_week)
);

CREATE INDEX idx_staff_schedules_staff ON public.staff_schedules(staff_id);

CREATE OR REPLACE FUNCTION public.user_owns_barbershop(p_barbershop_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.barbershops b
    WHERE b.id = p_barbershop_id AND b.owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.user_owns_staff(p_staff_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff s
    JOIN public.barbershops b ON b.id = s.barbershop_id
    WHERE s.id = p_staff_id AND b.owner_id = auth.uid()
  );
$$;

CREATE TRIGGER trg_staff_updated_at
BEFORE UPDATE ON public.staff
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_staff_services_updated_at
BEFORE UPDATE ON public.staff_services
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_staff_schedules_updated_at
BEFORE UPDATE ON public.staff_schedules
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage staff"
  ON public.staff FOR ALL TO authenticated
  USING (public.user_owns_barbershop(barbershop_id))
  WITH CHECK (public.user_owns_barbershop(barbershop_id));

CREATE POLICY "Owners manage staff_services"
  ON public.staff_services FOR ALL TO authenticated
  USING (public.user_owns_staff(staff_id))
  WITH CHECK (public.user_owns_staff(staff_id));

CREATE POLICY "Owners manage staff_schedules"
  ON public.staff_schedules FOR ALL TO authenticated
  USING (public.user_owns_staff(staff_id))
  WITH CHECK (public.user_owns_staff(staff_id));
