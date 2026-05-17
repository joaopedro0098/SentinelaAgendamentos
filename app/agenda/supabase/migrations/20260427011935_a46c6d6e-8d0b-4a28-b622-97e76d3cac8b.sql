-- 1. Tabela clientes
CREATE TABLE public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  nome text NOT NULL,
  whatsapp text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (barbearia_id, whatsapp)
);

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner manages own clientes"
  ON public.clientes FOR ALL TO authenticated
  USING (barbearia_id = public.user_barbearia_id(auth.uid()))
  WITH CHECK (barbearia_id = public.user_barbearia_id(auth.uid()));

CREATE POLICY "master manages clientes"
  ON public.clientes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'master'::app_role));

CREATE POLICY "public insere cliente em barbearia ativa"
  ON public.clientes FOR INSERT TO anon, authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.barbearias b WHERE b.id = clientes.barbearia_id AND b.ativa = true));

CREATE POLICY "public reads clientes de barbearia ativa"
  ON public.clientes FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.barbearias b WHERE b.id = clientes.barbearia_id AND b.ativa = true));

CREATE TRIGGER clientes_set_updated_at
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Adicionar cliente_id em agendamentos
ALTER TABLE public.agendamentos
  ADD COLUMN cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL;

CREATE INDEX idx_agendamentos_cliente_id ON public.agendamentos(cliente_id);

-- 3. Slot_minutos por barbeiro
ALTER TABLE public.barbeiros
  ADD COLUMN slot_minutos integer NOT NULL DEFAULT 30 CHECK (slot_minutos IN (15, 20, 30, 40, 45, 60));

-- 4. Serviços por barbeiro
CREATE TABLE public.barbeiro_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbeiro_id uuid NOT NULL REFERENCES public.barbeiros(id) ON DELETE CASCADE,
  nome text NOT NULL,
  duracao_minutos integer NOT NULL CHECK (duracao_minutos > 0 AND duracao_minutos <= 480),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.barbeiro_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner manages barbeiro_services"
  ON public.barbeiro_services FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.barbeiros bb WHERE bb.id = barbeiro_services.barbeiro_id AND bb.barbearia_id = public.user_barbearia_id(auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.barbeiros bb WHERE bb.id = barbeiro_services.barbeiro_id AND bb.barbearia_id = public.user_barbearia_id(auth.uid())));

CREATE POLICY "master manages barbeiro_services"
  ON public.barbeiro_services FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'master'::app_role));

CREATE POLICY "public reads barbeiro_services ativos"
  ON public.barbeiro_services FOR SELECT TO anon, authenticated
  USING (ativo = true AND EXISTS (
    SELECT 1 FROM public.barbeiros bb
    JOIN public.barbearias b ON b.id = bb.barbearia_id
    WHERE bb.id = barbeiro_services.barbeiro_id AND bb.ativo = true AND b.ativa = true
  ));

CREATE INDEX idx_barbeiro_services_barbeiro ON public.barbeiro_services(barbeiro_id);

-- 5. Função upsert_cliente_por_whatsapp
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