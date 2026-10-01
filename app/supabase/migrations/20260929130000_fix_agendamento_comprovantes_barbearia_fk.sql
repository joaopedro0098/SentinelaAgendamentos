-- agendamentos.barbearia_id → barbearias(id); a migration 20260925103000 apontava barbershops(id) por engano.

ALTER TABLE public.agendamento_comprovantes
  DROP CONSTRAINT IF EXISTS agendamento_comprovantes_barbearia_id_fkey;

ALTER TABLE public.agendamento_comprovantes
  ADD CONSTRAINT agendamento_comprovantes_barbearia_id_fkey
  FOREIGN KEY (barbearia_id) REFERENCES public.barbearias(id) ON DELETE CASCADE;

ALTER TABLE public.agendamento_panel_pagamentos
  DROP CONSTRAINT IF EXISTS agendamento_panel_pagamentos_barbearia_id_fkey;

ALTER TABLE public.agendamento_panel_pagamentos
  ADD CONSTRAINT agendamento_panel_pagamentos_barbearia_id_fkey
  FOREIGN KEY (barbearia_id) REFERENCES public.barbearias(id) ON DELETE CASCADE;
