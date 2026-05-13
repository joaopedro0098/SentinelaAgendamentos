-- Configuração global do webhook n8n (uma URL para todas as barbearias).
-- Linha singleton id = 1; apenas admins leem/atualizam via RLS.

CREATE TABLE public.platform_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  n8n_webhook_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.platform_settings (id, n8n_webhook_url)
VALUES (1, NULL)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.platform_settings IS 'Singleton (id=1): integrações globais da plataforma (ex.: webhook n8n).';

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_platform_settings_updated_at
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "Admins can read platform_settings"
  ON public.platform_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update platform_settings"
  ON public.platform_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
