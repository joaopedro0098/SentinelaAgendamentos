-- Fase G: titular_user_id não pode ser anulado ao deletar auth.users (alinha com NOT NULL Fase F).

ALTER TABLE public.clientes
  DROP CONSTRAINT IF EXISTS clientes_titular_user_id_fkey;

ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_titular_user_id_fkey
  FOREIGN KEY (titular_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
