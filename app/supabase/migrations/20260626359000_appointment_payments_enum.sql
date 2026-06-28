-- Enum novo precisa de migration própria: PG não permite usar o valor na mesma transação.
ALTER TYPE public.agendamento_status ADD VALUE IF NOT EXISTS 'aguardando_pagamento';
