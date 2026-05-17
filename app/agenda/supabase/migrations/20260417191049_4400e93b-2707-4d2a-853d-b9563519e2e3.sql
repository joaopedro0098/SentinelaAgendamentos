
-- =========================================
-- ENUMS
-- =========================================
CREATE TYPE public.app_role AS ENUM ('master', 'barbeiro');
CREATE TYPE public.plano_tipo AS ENUM ('basico', 'intermediario', 'avancado');
CREATE TYPE public.agendamento_status AS ENUM ('confirmado', 'cancelado', 'concluido');

-- =========================================
-- USER ROLES (separate table to avoid recursion)
-- =========================================
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "master can view all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'master'));
CREATE POLICY "master can manage all roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master'))
  WITH CHECK (public.has_role(auth.uid(), 'master'));

-- =========================================
-- BARBEARIAS
-- =========================================
CREATE TABLE public.barbearias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nome text NOT NULL,
  telefone text,
  endereco text,
  logo_url text,
  -- whatsapp business
  whatsapp_business_id text,
  whatsapp_phone_number_id text,
  -- plano
  plano plano_tipo NOT NULL DEFAULT 'basico',
  limite_clientes_mensais int NOT NULL DEFAULT 50,
  mp_subscription_id text,
  ativa boolean NOT NULL DEFAULT true,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.barbearias ENABLE ROW LEVEL SECURITY;

-- Helper: get user's barbearia_id (owner)
CREATE OR REPLACE FUNCTION public.user_barbearia_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.barbearias WHERE owner_id = _user_id LIMIT 1
$$;

-- Public can read active barbearias by slug (for /agendar/:slug)
CREATE POLICY "public can read active barbearias" ON public.barbearias
  FOR SELECT TO anon, authenticated USING (ativa = true);
CREATE POLICY "owner can read own barbearia" ON public.barbearias
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "master can read all barbearias" ON public.barbearias
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'master'));
CREATE POLICY "master manages barbearias" ON public.barbearias
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master'))
  WITH CHECK (public.has_role(auth.uid(), 'master'));
CREATE POLICY "owner updates own barbearia" ON public.barbearias
  FOR UPDATE TO authenticated USING (owner_id = auth.uid());

-- =========================================
-- SERVICES
-- =========================================
CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  nome text NOT NULL,
  duracao_minutos int NOT NULL DEFAULT 30,
  preco numeric(10,2) NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public reads active services of active barbearia" ON public.services
  FOR SELECT TO anon, authenticated USING (
    ativo = true AND EXISTS (SELECT 1 FROM public.barbearias b WHERE b.id = barbearia_id AND b.ativa = true)
  );
CREATE POLICY "owner manages own services" ON public.services
  FOR ALL TO authenticated
  USING (barbearia_id = public.user_barbearia_id(auth.uid()))
  WITH CHECK (barbearia_id = public.user_barbearia_id(auth.uid()));
CREATE POLICY "master manages all services" ON public.services
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master'))
  WITH CHECK (public.has_role(auth.uid(), 'master'));

-- =========================================
-- BARBEIROS (profissionais dentro de uma barbearia)
-- =========================================
CREATE TABLE public.barbeiros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  nome text NOT NULL,
  foto_url text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.barbeiros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public reads active barbeiros" ON public.barbeiros
  FOR SELECT TO anon, authenticated USING (
    ativo = true AND EXISTS (SELECT 1 FROM public.barbearias b WHERE b.id = barbearia_id AND b.ativa = true)
  );
CREATE POLICY "owner manages own barbeiros" ON public.barbeiros
  FOR ALL TO authenticated
  USING (barbearia_id = public.user_barbearia_id(auth.uid()))
  WITH CHECK (barbearia_id = public.user_barbearia_id(auth.uid()));
CREATE POLICY "master manages barbeiros" ON public.barbeiros
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master'))
  WITH CHECK (public.has_role(auth.uid(), 'master'));

-- =========================================
-- DISPONIBILIDADES (horário semanal padrão)
-- dia_semana: 0=domingo .. 6=sábado
-- =========================================
CREATE TABLE public.disponibilidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbeiro_id uuid NOT NULL REFERENCES public.barbeiros(id) ON DELETE CASCADE,
  dia_semana int NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio time NOT NULL,
  hora_fim time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.disponibilidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public reads disponibilidades" ON public.disponibilidades
  FOR SELECT TO anon, authenticated USING (
    EXISTS (
      SELECT 1 FROM public.barbeiros bb JOIN public.barbearias b ON b.id = bb.barbearia_id
      WHERE bb.id = barbeiro_id AND b.ativa = true
    )
  );
CREATE POLICY "owner manages disponibilidades" ON public.disponibilidades
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.barbeiros bb WHERE bb.id = barbeiro_id AND bb.barbearia_id = public.user_barbearia_id(auth.uid()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.barbeiros bb WHERE bb.id = barbeiro_id AND bb.barbearia_id = public.user_barbearia_id(auth.uid()))
  );
CREATE POLICY "master manages disponibilidades" ON public.disponibilidades
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master'))
  WITH CHECK (public.has_role(auth.uid(), 'master'));

-- =========================================
-- BLOQUEIOS (folgas, feriados, intervalos)
-- =========================================
CREATE TABLE public.bloqueios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbeiro_id uuid NOT NULL REFERENCES public.barbeiros(id) ON DELETE CASCADE,
  data date NOT NULL,
  hora_inicio time,
  hora_fim time,
  motivo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bloqueios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public reads bloqueios" ON public.bloqueios
  FOR SELECT TO anon, authenticated USING (
    EXISTS (
      SELECT 1 FROM public.barbeiros bb JOIN public.barbearias b ON b.id = bb.barbearia_id
      WHERE bb.id = barbeiro_id AND b.ativa = true
    )
  );
CREATE POLICY "owner manages bloqueios" ON public.bloqueios
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.barbeiros bb WHERE bb.id = barbeiro_id AND bb.barbearia_id = public.user_barbearia_id(auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.barbeiros bb WHERE bb.id = barbeiro_id AND bb.barbearia_id = public.user_barbearia_id(auth.uid())));
CREATE POLICY "master manages bloqueios" ON public.bloqueios
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master'))
  WITH CHECK (public.has_role(auth.uid(), 'master'));

-- =========================================
-- AGENDAMENTOS
-- =========================================
CREATE TABLE public.agendamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  barbeiro_id uuid NOT NULL REFERENCES public.barbeiros(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  data date NOT NULL,
  hora time NOT NULL,
  cliente_nome text NOT NULL,
  cliente_whatsapp text NOT NULL,
  status agendamento_status NOT NULL DEFAULT 'confirmado',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (barbeiro_id, data, hora)
);
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;

-- Função para checar se barbearia atingiu limite mensal
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

-- Público pode CRIAR agendamento se barbearia ativa e dentro do limite
CREATE POLICY "public insere agendamento" ON public.agendamentos
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.barbearias b WHERE b.id = barbearia_id AND b.ativa = true)
    AND public.barbearia_dentro_do_limite(barbearia_id)
    AND status = 'confirmado'
  );

-- Owner vê e gerencia agendamentos da sua barbearia
CREATE POLICY "owner reads agendamentos" ON public.agendamentos
  FOR SELECT TO authenticated USING (barbearia_id = public.user_barbearia_id(auth.uid()));
CREATE POLICY "owner updates agendamentos" ON public.agendamentos
  FOR UPDATE TO authenticated USING (barbearia_id = public.user_barbearia_id(auth.uid()));
CREATE POLICY "owner deletes agendamentos" ON public.agendamentos
  FOR DELETE TO authenticated USING (barbearia_id = public.user_barbearia_id(auth.uid()));

-- Master vê tudo
CREATE POLICY "master manages agendamentos" ON public.agendamentos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master'))
  WITH CHECK (public.has_role(auth.uid(), 'master'));

-- =========================================
-- TRIGGER updated_at em barbearias
-- =========================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_barbearias_updated
BEFORE UPDATE ON public.barbearias
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- TRIGGER: ao criar usuário, atribui role 'barbeiro' por padrão
-- =========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'barbeiro')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
