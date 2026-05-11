-- =========================================
-- BARBEARIAS (perfil público + dono opcional p/ Parte 2)
-- =========================================
CREATE TABLE public.barbershops (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT 'Barbearia',
  avatar_url TEXT,
  status_text TEXT NOT NULL DEFAULT 'online',
  whatsapp_number TEXT,
  n8n_webhook_url TEXT,
  welcome_message TEXT NOT NULL DEFAULT 'Olá! 👋 Como posso te ajudar hoje?',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_barbershops_owner ON public.barbershops(owner_id);

ALTER TABLE public.barbershops ENABLE ROW LEVEL SECURITY;

-- Perfil público: qualquer um pode ler
CREATE POLICY "Public can view barbershops"
  ON public.barbershops FOR SELECT
  USING (true);

-- Apenas o dono pode atualizar/inserir/deletar (Parte 2)
CREATE POLICY "Owners can insert their barbershop"
  ON public.barbershops FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update their barbershop"
  ON public.barbershops FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners can delete their barbershop"
  ON public.barbershops FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);

-- =========================================
-- CONVERSAS (uma por cliente x barbearia)
-- =========================================
CREATE TABLE public.conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  customer_phone TEXT NOT NULL,
  customer_name TEXT,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (barbershop_id, customer_phone)
);

CREATE INDEX idx_conversations_barbershop ON public.conversations(barbershop_id);
CREATE INDEX idx_conversations_phone ON public.conversations(customer_phone);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Cliente sem login: liberado leitura/insert (filtrado pelo telefone na app)
CREATE POLICY "Public can view conversations"
  ON public.conversations FOR SELECT
  USING (true);

CREATE POLICY "Public can insert conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public can update conversations"
  ON public.conversations FOR UPDATE
  USING (true);

-- =========================================
-- MENSAGENS
-- =========================================
CREATE TYPE public.message_sender AS ENUM ('customer', 'ai');
CREATE TYPE public.message_status AS ENUM ('sending', 'sent', 'delivered', 'read', 'failed');

CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  barbershop_id UUID NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  sender public.message_sender NOT NULL,
  content TEXT NOT NULL,
  status public.message_status NOT NULL DEFAULT 'sent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation ON public.messages(conversation_id, created_at);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view messages"
  ON public.messages FOR SELECT
  USING (true);

CREATE POLICY "Public can insert messages"
  ON public.messages FOR INSERT
  WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;

-- =========================================
-- TRIGGER: atualizar last_message_at
-- =========================================
CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_conversation_last_message
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.update_conversation_last_message();

-- =========================================
-- TRIGGER: updated_at em barbershops
-- =========================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_barbershops_updated_at
BEFORE UPDATE ON public.barbershops
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================
-- STORAGE: avatares de barbearias
-- =========================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('barbershop-avatars', 'barbershop-avatars', true);

CREATE POLICY "Public can view barbershop avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'barbershop-avatars');

CREATE POLICY "Authenticated can upload barbershop avatars"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'barbershop-avatars');

CREATE POLICY "Authenticated can update barbershop avatars"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'barbershop-avatars');

CREATE POLICY "Authenticated can delete barbershop avatars"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'barbershop-avatars');

-- =========================================
-- BARBEARIA DEMO (para testar imediatamente)
-- =========================================
INSERT INTO public.barbershops (slug, display_name, status_text, welcome_message)
VALUES ('demo', 'Barbearia Demo', 'online', 'Olá! 👋 Sou o atendente virtual da Barbearia Demo. Como posso te ajudar hoje?');