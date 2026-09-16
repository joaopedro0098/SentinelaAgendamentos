/**
 * Atualiza meta_delivery_* em whatsapp_mensagens_enviadas a partir de statuses[].
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type MetaDeliveryStatus = "sent" | "delivered" | "read" | "failed";

const STATUS_RANK: Record<MetaDeliveryStatus, number> = {
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 100,
};

function parseDeliveryStatus(raw: string): MetaDeliveryStatus | null {
  const v = raw.trim().toLowerCase();
  if (v === "sent" || v === "delivered" || v === "read" || v === "failed") return v;
  return null;
}

function shouldApplyStatus(
  current: MetaDeliveryStatus | null,
  incoming: MetaDeliveryStatus,
): boolean {
  if (incoming === "failed") return true;
  if (current === "failed") return false;
  if (current === "read" && incoming === "delivered") return false;
  if (current === "read" && incoming === "sent") return false;
  if (current === "delivered" && incoming === "sent") return false;
  const curRank = current ? STATUS_RANK[current] : 0;
  return STATUS_RANK[incoming] >= curRank;
}

export async function processMetaMessageStatusUpdate(
  supabase: SupabaseClient,
  statusRow: Record<string, unknown>,
): Promise<void> {
  const wamid = String(statusRow.id ?? "").trim();
  const status = parseDeliveryStatus(String(statusRow.status ?? ""));
  if (!wamid || !status) return;

  const { data: row, error: fetchErr } = await supabase
    .from("whatsapp_mensagens_enviadas")
    .select("id, meta_delivery_status")
    .eq("provider", "meta")
    .eq("external_message_id", wamid)
    .maybeSingle();

  if (fetchErr) throw new Error(fetchErr.message);
  if (!row?.id) return;

  const current = row.meta_delivery_status
    ? parseDeliveryStatus(String(row.meta_delivery_status))
    : null;

  if (!shouldApplyStatus(current, status)) return;

  const patch: Record<string, unknown> = {
    meta_delivery_status: status,
    meta_delivery_updated_at: new Date().toISOString(),
  };

  if (status === "failed") {
    const errors = statusRow.errors;
    const first = Array.isArray(errors) ? errors[0] : null;
    if (first && typeof first === "object") {
      patch.meta_delivery_error_code = (first as { code?: number }).code ?? null;
      const details = (first as { error_data?: { details?: string } }).error_data?.details;
      patch.meta_delivery_error_detail = details ??
        (first as { message?: string }).message ??
        null;
    }
  } else {
    patch.meta_delivery_error_code = null;
    patch.meta_delivery_error_detail = null;
  }

  const { error: updErr } = await supabase
    .from("whatsapp_mensagens_enviadas")
    .update(patch)
    .eq("id", row.id);

  if (updErr) throw new Error(updErr.message);
}
