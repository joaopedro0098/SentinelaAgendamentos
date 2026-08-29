-- request_id retornados pela Meta ao disparar smb_app_data (coexistência).

ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS waba_coex_contacts_sync_request_id text,
  ADD COLUMN IF NOT EXISTS waba_coex_history_sync_request_id text;

COMMENT ON COLUMN public.barbershops.waba_coex_contacts_sync_request_id IS
  'request_id Meta do POST smb_app_data sync_type=smb_app_state_sync (suporte Meta).';
COMMENT ON COLUMN public.barbershops.waba_coex_history_sync_request_id IS
  'request_id Meta do POST smb_app_data sync_type=history (suporte Meta).';
