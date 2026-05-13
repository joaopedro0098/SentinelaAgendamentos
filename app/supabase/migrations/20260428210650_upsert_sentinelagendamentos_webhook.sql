INSERT INTO public.barbershops (
  slug,
  display_name,
  status_text,
  welcome_message,
  n8n_webhook_url
)
VALUES (
  'sentinelagendamentos',
  'Sentinel Agendamentos',
  'online',
  'Olá! Como posso te ajudar hoje?',
  'https://agenciadeia-n8n.vr2lik.easypanel.host/webhook/agente'
)
ON CONFLICT (slug) DO UPDATE
SET
  n8n_webhook_url = EXCLUDED.n8n_webhook_url,
  updated_at = now();
