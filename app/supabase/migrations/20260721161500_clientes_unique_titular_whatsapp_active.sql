-- Fase E3: unicidade (titular_user_id, whatsapp normalizado) para cadastros ativos.
-- Opção B: sem flags de exceção. Índice parcial exclui archived_at IS NOT NULL para que
-- perdedores arquivados no merge coexistam com o sobrevivente (mesmo WhatsApp).

-- supabase:disable-transaction

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_clientes_titular_whatsapp_active
  ON public.clientes (titular_user_id, public.cliente_whatsapp_digits(whatsapp))
  WHERE archived_at IS NULL
    AND titular_user_id IS NOT NULL
    AND length(public.cliente_whatsapp_digits(whatsapp)) >= 10;

COMMENT ON INDEX public.idx_clientes_titular_whatsapp_active IS
  'Um WhatsApp ativo por titular (CT). Normalizado via cliente_whatsapp_digits. Cadastros arquivados excluídos do índice.';
