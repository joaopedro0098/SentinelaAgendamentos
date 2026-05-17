-- Ponte: barbershops + staff → schema de agendamento (barbearias / barbeiros)
-- Necessário para /agendar/:slug usar o mesmo slug do painel.

DO $$ BEGIN
  CREATE TYPE public.agendamento_status AS ENUM ('confirmado', 'cancelado', 'concluido');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.barbearias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nome text NOT NULL,
  logo_url text,
  ativa boolean NOT NULL DEFAULT true,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  limite_clientes_mensais int NOT NULL DEFAULT 500,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.barbeiros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  nome text NOT NULL,
  foto_url text,
  ativo boolean NOT NULL DEFAULT true,
  slot_minutos int NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.barbeiros ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES public.staff(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS barbeiros_staff_id_unique ON public.barbeiros(staff_id);

CREATE TABLE IF NOT EXISTS public.disponibilidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbeiro_id uuid NOT NULL REFERENCES public.barbeiros(id) ON DELETE CASCADE,
  dia_semana int NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio time NOT NULL,
  hora_fim time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.barbeiro_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbeiro_id uuid NOT NULL REFERENCES public.barbeiros(id) ON DELETE CASCADE,
  nome text NOT NULL,
  duracao_minutos int NOT NULL DEFAULT 30 CHECK (duracao_minutos > 0 AND duracao_minutos <= 480),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bloqueios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbeiro_id uuid NOT NULL REFERENCES public.barbeiros(id) ON DELETE CASCADE,
  data date NOT NULL,
  hora_inicio time,
  hora_fim time,
  motivo text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  nome text NOT NULL,
  whatsapp text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (barbearia_id, whatsapp)
);

CREATE TABLE IF NOT EXISTS public.agendamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  barbeiro_id uuid NOT NULL REFERENCES public.barbeiros(id) ON DELETE CASCADE,
  data date NOT NULL,
  hora time NOT NULL,
  cliente_nome text NOT NULL,
  cliente_whatsapp text NOT NULL,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  duracao_minutos int NOT NULL DEFAULT 30,
  status public.agendamento_status NOT NULL DEFAULT 'confirmado',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (barbeiro_id, data, hora)
);

ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS cliente_id uuid;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS duracao_minutos int NOT NULL DEFAULT 30;

ALTER TABLE public.barbearias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barbeiros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disponibilidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barbeiro_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bloqueios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public can read active barbearias" ON public.barbearias;
CREATE POLICY "public can read active barbearias" ON public.barbearias
  FOR SELECT TO anon, authenticated USING (ativa = true);

DROP POLICY IF EXISTS "public reads active barbeiros" ON public.barbeiros;
CREATE POLICY "public reads active barbeiros" ON public.barbeiros
  FOR SELECT TO anon, authenticated USING (
    ativo = true AND EXISTS (SELECT 1 FROM public.barbearias b WHERE b.id = barbearia_id AND b.ativa = true)
  );

DROP POLICY IF EXISTS "public reads disponibilidades" ON public.disponibilidades;
CREATE POLICY "public reads disponibilidades" ON public.disponibilidades
  FOR SELECT TO anon, authenticated USING (
    EXISTS (
      SELECT 1 FROM public.barbeiros bb
      JOIN public.barbearias b ON b.id = bb.barbearia_id
      WHERE bb.id = barbeiro_id AND b.ativa = true
    )
  );

DROP POLICY IF EXISTS "public reads barbeiro_services ativos" ON public.barbeiro_services;
CREATE POLICY "public reads barbeiro_services ativos" ON public.barbeiro_services
  FOR SELECT TO anon, authenticated USING (
    ativo = true AND EXISTS (
      SELECT 1 FROM public.barbeiros bb
      JOIN public.barbearias b ON b.id = bb.barbearia_id
      WHERE bb.id = barbeiro_services.barbeiro_id AND bb.ativo = true AND b.ativa = true
    )
  );

DROP POLICY IF EXISTS "public reads bloqueios" ON public.bloqueios;
CREATE POLICY "public reads bloqueios" ON public.bloqueios
  FOR SELECT TO anon, authenticated USING (
    EXISTS (
      SELECT 1 FROM public.barbeiros bb
      JOIN public.barbearias b ON b.id = bb.barbearia_id
      WHERE bb.id = barbeiro_id AND b.ativa = true
    )
  );

DROP POLICY IF EXISTS "public insere cliente em barbearia ativa" ON public.clientes;
CREATE POLICY "public insere cliente em barbearia ativa" ON public.clientes
  FOR INSERT TO anon, authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.barbearias b WHERE b.id = barbearia_id AND b.ativa = true));

DROP POLICY IF EXISTS "public reads clientes de barbearia ativa" ON public.clientes;
CREATE POLICY "public reads clientes de barbearia ativa" ON public.clientes
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.barbearias b WHERE b.id = barbearia_id AND b.ativa = true));

DROP POLICY IF EXISTS "public reads agendamentos confirmados" ON public.agendamentos;
CREATE POLICY "public reads agendamentos confirmados" ON public.agendamentos
  FOR SELECT TO anon, authenticated USING (status = 'confirmado');

CREATE OR REPLACE FUNCTION public.barbearia_dentro_do_limite(_barbearia_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _limite int;
  _count int;
BEGIN
  SELECT limite_clientes_mensais INTO _limite FROM public.barbearias WHERE id = _barbearia_id AND ativa = true;
  IF _limite IS NULL THEN RETURN false; END IF;
  SELECT count(*) INTO _count FROM public.agendamentos
    WHERE barbearia_id = _barbearia_id
      AND date_trunc('month', created_at) = date_trunc('month', now());
  RETURN _count < _limite;
END;
$$;

DROP POLICY IF EXISTS "public insere agendamento" ON public.agendamentos;
CREATE POLICY "public insere agendamento" ON public.agendamentos
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.barbearias b WHERE b.id = barbearia_id AND b.ativa = true)
    AND public.barbearia_dentro_do_limite(barbearia_id)
    AND status = 'confirmado'
  );

CREATE OR REPLACE FUNCTION public.upsert_cliente_por_whatsapp(
  _barbearia_id uuid,
  _whatsapp text,
  _nome text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _normalized text;
  _id uuid;
BEGIN
  _normalized := regexp_replace(COALESCE(_whatsapp, ''), '[^0-9]', '', 'g');
  IF length(_normalized) = 0 THEN
    _normalized := '—';
  END IF;

  INSERT INTO public.clientes (barbearia_id, whatsapp, nome)
  VALUES (_barbearia_id, _normalized, _nome)
  ON CONFLICT (barbearia_id, whatsapp)
    DO UPDATE SET nome = EXCLUDED.nome, updated_at = now()
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

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
    ON CONFLICT (staff_id) WHERE staff_id IS NOT NULL DO UPDATE SET
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

GRANT EXECUTE ON FUNCTION public.ensure_agenda_from_barbershop_slug(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_cliente_por_whatsapp(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.barbearia_dentro_do_limite(uuid) TO anon, authenticated;
