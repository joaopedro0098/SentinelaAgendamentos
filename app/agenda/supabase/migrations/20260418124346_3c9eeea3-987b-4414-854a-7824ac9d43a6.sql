
CREATE TABLE public.planos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo public.plano_tipo NOT NULL UNIQUE,
  mp_plan_id text NOT NULL,
  preco numeric NOT NULL DEFAULT 0,
  limite_clientes_mensais integer NOT NULL DEFAULT 50,
  nome_exibicao text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone reads active planos" ON public.planos
  FOR SELECT TO anon, authenticated USING (ativo = true);

CREATE POLICY "master manages planos" ON public.planos
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'master'::app_role))
  WITH CHECK (has_role(auth.uid(), 'master'::app_role));

CREATE TRIGGER planos_updated_at
  BEFORE UPDATE ON public.planos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.barbearias
  ADD COLUMN IF NOT EXISTS plano_status text NOT NULL DEFAULT 'pendente';

INSERT INTO public.planos (tipo, mp_plan_id, preco, limite_clientes_mensais, nome_exibicao) VALUES
  ('basico', 'a355f28a66d34b368ffb3c17b25d203a', 49.90, 50, 'Básico'),
  ('intermediario', '1fa87bfa1c1446cf99518116c4e8c7b9', 89.90, 150, 'Intermediário'),
  ('avancado', '1c1fc05b5d9e49b2ae00e5eb0247a3d6', 149.90, 500, 'Avançado');
