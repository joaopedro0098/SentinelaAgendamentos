-- Assinatura: trial 14 dias corridos, bloqueio parcial de novos agendamentos, admin isento.

DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM ('trial', 'active', 'grace', 'expired', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS trial_started_at date NOT NULL DEFAULT (CURRENT_DATE),
  ADD COLUMN IF NOT EXISTS subscription_status public.subscription_status NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS current_period_end date,
  ADD COLUMN IF NOT EXISTS grace_until date,
  ADD COLUMN IF NOT EXISTS mp_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_notice text;

COMMENT ON COLUMN public.barbershops.trial_started_at IS
  'Primeiro dia do trial (14 dias corridos; bloqueio a partir do dia trial_started_at + 14).';
COMMENT ON COLUMN public.barbershops.subscription_status IS
  'trial | active | grace (3 dias após falha) | expired | cancelled (usa até current_period_end).';
COMMENT ON COLUMN public.barbershops.current_period_end IS
  'Último dia inclusivo do período pago ou cancelado com acesso residual.';
COMMENT ON COLUMN public.barbershops.grace_until IS
  'Último dia inclusivo da tolerância após falha de pagamento.';
COMMENT ON COLUMN public.barbershops.subscription_notice IS
  'Aviso exibido no painel (pagamento pendente, grace, etc.).';

-- Contas existentes: trial a partir de hoje (não há clientes pagantes ainda).
UPDATE public.barbershops
SET
  trial_started_at = COALESCE(trial_started_at, created_at::date, CURRENT_DATE),
  subscription_status = COALESCE(subscription_status, 'trial'::public.subscription_status)
WHERE trial_started_at IS NULL OR subscription_status IS NULL;

-- Admin: dono da barbearia sentinelagendamentos
INSERT INTO public.user_roles (user_id, role)
SELECT b.owner_id, 'admin'::public.app_role
FROM public.barbershops b
WHERE b.slug = 'sentinelagendamentos' AND b.owner_id IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;

CREATE OR REPLACE FUNCTION public.barbearia_pode_agendar(_barbearia_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shop record;
  _ativa boolean;
BEGIN
  SELECT b.ativa, s.owner_id, s.trial_started_at, s.subscription_status,
         s.current_period_end, s.grace_until
  INTO _shop
  FROM public.barbearias b
  JOIN public.barbershops s ON s.slug = b.slug
  WHERE b.id = _barbearia_id;

  IF NOT FOUND OR NOT _shop.ativa THEN
    RETURN false;
  END IF;

  IF _shop.owner_id IS NOT NULL AND public.has_role(_shop.owner_id, 'admin'::public.app_role) THEN
    RETURN true;
  END IF;

  IF _shop.subscription_status = 'trial' THEN
    RETURN CURRENT_DATE < (_shop.trial_started_at + 14);
  END IF;

  IF _shop.subscription_status = 'active' THEN
    RETURN _shop.current_period_end IS NULL OR CURRENT_DATE <= _shop.current_period_end;
  END IF;

  IF _shop.subscription_status = 'cancelled' THEN
    RETURN _shop.current_period_end IS NOT NULL AND CURRENT_DATE <= _shop.current_period_end;
  END IF;

  IF _shop.subscription_status = 'grace' THEN
    RETURN _shop.grace_until IS NOT NULL AND CURRENT_DATE <= _shop.grace_until;
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.barbearia_pode_agendar(uuid) IS
  'Libera novos agendamentos/reagendamentos. Admin isento. Trial = 14 dias corridos.';

CREATE OR REPLACE FUNCTION public.barbearia_dentro_do_limite(_barbearia_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.barbearia_pode_agendar(_barbearia_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.check_barbearia_pode_agendar(p_barbearia_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.barbearia_pode_agendar(p_barbearia_id);
$$;

GRANT EXECUTE ON FUNCTION public.barbearia_pode_agendar(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_barbearia_pode_agendar(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_subscription()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shop record;
  _trial_end date;
  _trial_days_left int;
  _can_book boolean;
  _barbearia_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'not_authenticated');
  END IF;

  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN json_build_object(
      'is_admin', true,
      'can_book', true,
      'subscription_status', 'active',
      'label', 'Administrador — acesso ilimitado'
    );
  END IF;

  SELECT s.* INTO _shop
  FROM public.barbershops s
  WHERE s.owner_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'no_shop', 'can_book', false);
  END IF;

  SELECT b.id INTO _barbearia_id
  FROM public.barbearias b
  WHERE b.slug = _shop.slug
  LIMIT 1;

  _can_book := _barbearia_id IS NOT NULL AND public.barbearia_pode_agendar(_barbearia_id);
  _trial_end := _shop.trial_started_at + 13;
  _trial_days_left := GREATEST(0, (_shop.trial_started_at + 14) - CURRENT_DATE);

  RETURN json_build_object(
    'is_admin', false,
    'can_book', _can_book,
    'subscription_status', _shop.subscription_status,
    'trial_started_at', _shop.trial_started_at,
    'trial_days_left', _trial_days_left,
    'trial_last_day', _trial_end,
    'current_period_end', _shop.current_period_end,
    'grace_until', _shop.grace_until,
    'subscription_notice', _shop.subscription_notice,
    'mp_subscription_id', _shop.mp_subscription_id,
    'plan_price_label', 'R$ 19,90/mês'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_subscription() TO authenticated;

-- Cadastro: trial na criação da barbearia
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_name text;
BEGIN
  base_name := coalesce(
    NEW.raw_user_meta_data->>'shop_name',
    NEW.raw_user_meta_data->>'barbershop_name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1),
    'barbearia'
  );

  INSERT INTO public.profiles (id, display_name, email, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'barber')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.barbershops (
    owner_id, slug, display_name, trial_started_at, subscription_status
  )
  VALUES (
    NEW.id,
    public.generate_unique_slug(base_name),
    base_name,
    CURRENT_DATE,
    'trial'
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- Bloqueio em reagendamento
CREATE OR REPLACE FUNCTION public.reagendar_agendamento(
  p_agendamento_id uuid,
  p_data date,
  p_hora time,
  p_barbeiro_id uuid,
  p_duracao_minutos int,
  p_observacao text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _barbearia_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT a.barbearia_id INTO _barbearia_id
  FROM public.agendamentos a
  WHERE a.id = p_agendamento_id AND a.status = 'confirmado';

  IF _barbearia_id IS NULL THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;

  IF NOT public.barbearia_pode_agendar(_barbearia_id) THEN
    RAISE EXCEPTION 'Função bloqueada. Favor realizar o pagamento da mensalidade para liberar.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.barbearias b
    WHERE b.id = _barbearia_id AND b.owner_id = auth.uid()
    UNION ALL
    SELECT 1 FROM public.barbearias b
    INNER JOIN public.barbershops s ON s.slug = b.slug
    WHERE b.id = _barbearia_id AND s.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Sem permissão para alterar este agendamento';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.barbeiros bb
    WHERE bb.id = p_barbeiro_id AND bb.barbearia_id = _barbearia_id AND bb.ativo = true
  ) THEN
    RAISE EXCEPTION 'Colaborador inválido';
  END IF;

  IF p_duracao_minutos IS NULL OR p_duracao_minutos < 1 THEN
    RAISE EXCEPTION 'Duração inválida';
  END IF;

  UPDATE public.agendamentos
  SET
    data = p_data,
    hora = p_hora,
    barbeiro_id = p_barbeiro_id,
    duracao_minutos = p_duracao_minutos,
    observacao = NULLIF(trim(COALESCE(p_observacao, observacao)), '')
  WHERE id = p_agendamento_id;
END;
$$;

DROP POLICY IF EXISTS "public insere agendamento" ON public.agendamentos;
CREATE POLICY "public insere agendamento" ON public.agendamentos
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.barbearias b WHERE b.id = barbearia_id AND b.ativa = true)
    AND public.barbearia_pode_agendar(barbearia_id)
    AND status = 'confirmado'
  );
