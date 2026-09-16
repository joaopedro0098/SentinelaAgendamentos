import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type WabaWebhookEventKind = "inbound_button" | "message_status";

export async function claimWabaWebhookEvent(
  supabase: SupabaseClient,
  params: {
    dedupeKey: string;
    eventKind: WabaWebhookEventKind;
    wabaId?: string;
    phoneNumberId?: string;
    payload?: Record<string, unknown>;
  },
): Promise<string | null> {
  const { data, error } = await supabase.rpc("try_insert_waba_webhook_event", {
    p_dedupe_key: params.dedupeKey,
    p_event_kind: params.eventKind,
    p_waba_id: params.wabaId ?? null,
    p_phone_number_id: params.phoneNumberId ?? null,
    p_payload: params.payload ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data ? String(data) : null;
}

export async function markWabaWebhookEventProcessed(
  supabase: SupabaseClient,
  eventId: string,
  processError?: string,
): Promise<void> {
  const { error } = await supabase.rpc("mark_waba_webhook_event_processed", {
    p_event_id: eventId,
    p_error: processError ?? null,
  });
  if (error) {
    console.error("markWabaWebhookEventProcessed:", error.message);
  }
}
