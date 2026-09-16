/**
 * Ingestão field=messages (inbound button + statuses outbound).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { claimWabaWebhookEvent, markWabaWebhookEventProcessed } from "./metaWabaWebhookDedupe.ts";
import { processMetaInboundButtonMessage } from "./metaWabaInboundButtonHandler.ts";
import { processMetaMessageStatusUpdate } from "./metaWabaMessageStatusHandler.ts";

export async function ingestMetaMessagesWebhookChange(
  supabase: SupabaseClient,
  entryWabaId: string,
  value: Record<string, unknown>,
): Promise<void> {
  const phoneNumberId = String(
    (value.metadata as { phone_number_id?: string } | undefined)?.phone_number_id ?? "",
  );

  const statuses = value.statuses;
  if (Array.isArray(statuses)) {
    for (const raw of statuses) {
      if (!raw || typeof raw !== "object") continue;
      const statusRow = raw as Record<string, unknown>;
      const wamid = String(statusRow.id ?? "").trim();
      const status = String(statusRow.status ?? "").trim().toLowerCase();
      if (!wamid || !status) continue;

      const dedupeKey = `status:${wamid}:${status}`;
      let eventId: string | null = null;
      try {
        eventId = await claimWabaWebhookEvent(supabase, {
          dedupeKey,
          eventKind: "message_status",
          wabaId: entryWabaId,
          phoneNumberId,
          payload: statusRow,
        });
        if (!eventId) continue;

        await processMetaMessageStatusUpdate(supabase, statusRow);
        await markWabaWebhookEventProcessed(supabase, eventId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[metaWabaWebhookMessages] status:", dedupeKey, msg);
        if (eventId) await markWabaWebhookEventProcessed(supabase, eventId, msg);
      }
    }
  }

  const messages = value.messages;
  if (!Array.isArray(messages)) return;

  for (const raw of messages) {
    if (!raw || typeof raw !== "object") continue;
    const msg = raw as Record<string, unknown>;
    if (String(msg.type ?? "") !== "button") continue;

    const inboundWamid = String(msg.id ?? "").trim();
    const button = msg.button as { payload?: string; text?: string } | undefined;
    const context = msg.context as { id?: string; from?: string } | undefined;
    if (!inboundWamid || !button) continue;

    const dedupeKey = `inbound:${inboundWamid}`;
    let eventId: string | null = null;
    try {
      eventId = await claimWabaWebhookEvent(supabase, {
        dedupeKey,
        eventKind: "inbound_button",
        wabaId: entryWabaId,
        phoneNumberId,
        payload: msg,
      });
      if (!eventId) continue;

      await processMetaInboundButtonMessage(supabase, {
        phoneNumberId,
        fromPhone: String(msg.from ?? ""),
        contextWamid: String(context?.id ?? ""),
        buttonText: String(button.text ?? ""),
        buttonPayload: String(button.payload ?? ""),
      });
      await markWabaWebhookEventProcessed(supabase, eventId);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error("[metaWabaWebhookMessages] button:", dedupeKey, errMsg);
      if (eventId) await markWabaWebhookEventProcessed(supabase, eventId, errMsg);
    }
  }
}
