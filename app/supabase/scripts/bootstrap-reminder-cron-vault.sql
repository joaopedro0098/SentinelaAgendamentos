-- Execute UMA VEZ no SQL Editor (substitua pelo mesmo valor de REMINDER_CRON_SECRET nas Edge Function Secrets).
-- Exemplo:
-- SELECT vault.create_secret(
--   'cole_aqui_o_mesmo_valor_do_REMINDER_CRON_SECRET',
--   'reminder_cron_secret',
--   'Secret para o pg_cron invocar process-appointment-reminders'
-- );

-- Teste manual do invoke (deve retornar um request_id):
-- SELECT public.invoke_process_appointment_reminders_cron();

-- Confirme o job:
-- SELECT jobid, jobname, schedule, command, active FROM cron.job WHERE jobname = 'process-appointment-reminders-daily';
