ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS reminder_3h_sent_at timestamptz;

COMMENT ON COLUMN public.agendamentos.reminder_3h_sent_at IS
  'Quando o lembrete simples (sem botões, ~3h antes) foi enviado ao paciente.';
