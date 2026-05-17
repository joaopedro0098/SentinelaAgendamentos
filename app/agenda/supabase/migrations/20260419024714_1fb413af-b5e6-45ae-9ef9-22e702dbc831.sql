CREATE TABLE public.feriados (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  barbearia_id uuid NOT NULL REFERENCES public.barbearias(id) ON DELETE CASCADE,
  data date NOT NULL,
  nome text,
  dia_inteiro boolean NOT NULL DEFAULT true,
  hora_inicio time,
  hora_fim time,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_feriados_barbearia_data ON public.feriados(barbearia_id, data);

ALTER TABLE public.feriados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner manages feriados"
ON public.feriados FOR ALL TO authenticated
USING (barbearia_id = user_barbearia_id(auth.uid()))
WITH CHECK (barbearia_id = user_barbearia_id(auth.uid()));

CREATE POLICY "master manages feriados"
ON public.feriados FOR ALL TO authenticated
USING (has_role(auth.uid(), 'master'::app_role))
WITH CHECK (has_role(auth.uid(), 'master'::app_role));

CREATE POLICY "public reads feriados"
ON public.feriados FOR SELECT TO anon, authenticated
USING (EXISTS (SELECT 1 FROM barbearias b WHERE b.id = feriados.barbearia_id AND b.ativa = true));