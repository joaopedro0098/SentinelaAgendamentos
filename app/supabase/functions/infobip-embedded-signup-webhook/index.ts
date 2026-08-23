/**
 * POST /infobip-embedded-signup-webhook
 *
 * Recebe status de registro WABA pós share-waba (IN_PROGRESS / FAILED / FINISHED).
 * Separado de infobip-whatsapp-webhook (mensagens inbound de pacientes).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verifyInfobipWebhook } from "../_shared/infobipWebhookAuth.ts";
import { normalizeBrazilPhoneE164Digits } from "../_shared/twilioWhatsapp.ts";

type EmbeddedSignupSender = {
  phoneNumberId?: string;
  displayPhoneNumber?: string;
  type?: string;
  status?: string;
  registrationInfo?: string;
};

type EmbeddedSignupPayload = {
  businessAccountId?: number | string;
  status?: string;
  createdAt?: string;
  lastModifiedAt?: string;
  senders?: EmbeddedSignupSender[];
  businessPortfolioId?: number;
  registrationInfo?: string;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function normalizeStatus(value: string): string {
  return value.trim().toUpperCase();
}

export function resolveTargetSender(
  senders: EmbeddedSignupSender[],
  storedPhoneNumberId: string | null,
): EmbeddedSignupSender | null {
  if (!senders?.length) return null;

  if (storedPhoneNumberId) {
    const match = senders.find(
      (s) => String(s.phoneNumberId ?? "").trim() === storedPhoneNumberId.trim(),
    );
    if (match) return match;
  }

  if (senders.length === 1) return senders[0];
  return senders.find((s) => normalizeStatus(String(s.status ?? "")) === "FINISHED") ?? senders[0];
}

function allSendersFailed(senders: EmbeddedSignupSender[]): boolean {
  if (!senders.length) return false;
  return senders.every((s) => normalizeStatus(String(s.status ?? "")) === "FAILED");
}

function parseConnectedAt(lastModifiedAt?: string): string {
  if (lastModifiedAt) {
    const parsed = new Date(lastModifiedAt);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authOk = await verifyInfobipWebhook(req);
  if (!authOk) {
    console.error("infobip-embedded-signup-webhook: autenticação inválida");
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  let payload: EmbeddedSignupPayload;
  try {
    payload = JSON.parse(rawBody) as EmbeddedSignupPayload;
  } catch {
    console.error("infobip-embedded-signup-webhook: JSON inválido", rawBody.slice(0, 500));
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const businessAccountIdRaw = payload.businessAccountId;
  if (
    businessAccountIdRaw === undefined ||
    businessAccountIdRaw === null ||
    String(businessAccountIdRaw).trim() === ""
  ) {
    console.warn("infobip-embedded-signup-webhook: businessAccountId ausente");
    return jsonResponse({ success: true });
  }

  const wabaId = String(businessAccountIdRaw).trim();
  const statusRaw = String(payload.status ?? "").trim();
  if (!statusRaw) {
    console.warn("infobip-embedded-signup-webhook: status ausente", { wabaId });
    return jsonResponse({ success: true });
  }

  const status = normalizeStatus(statusRaw);
  if (status !== "IN_PROGRESS" && status !== "FAILED" && status !== "FINISHED") {
    console.warn("infobip-embedded-signup-webhook: status desconhecido", { wabaId, status: statusRaw });
    return jsonResponse({ success: true });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: shops, error: shopErr } = await supabase
    .from("barbershops")
    .select("id, waba_id, waba_phone_number_id, waba_connect_status")
    .eq("waba_id", wabaId)
    .order("updated_at", { ascending: false })
    .limit(2);

  if (shopErr) {
    console.error("infobip-embedded-signup-webhook: erro ao buscar barbershop", shopErr.message);
    return jsonResponse({ error: "Internal server error" }, 500);
  }

  if (!shops?.length) {
    console.warn("infobip-embedded-signup-webhook: barbershop não encontrado", { wabaId });
    return jsonResponse({ success: true });
  }

  if (shops.length > 1) {
    console.error("infobip-embedded-signup-webhook: WABA duplicada", { wabaId, count: shops.length });
  }

  const shop = shops[0];
  const senders = payload.senders ?? [];

  if (shop.waba_connect_status === "connected" && status === "FINISHED") {
    return jsonResponse({ success: true });
  }

  let effectiveStatus = status;
  if (status === "FINISHED" && allSendersFailed(senders)) {
    effectiveStatus = "FAILED";
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { updated_at: now };

  if (effectiveStatus === "IN_PROGRESS") {
    update.waba_connect_status = "provisioning";
    if (!shop.waba_id) {
      update.waba_id = wabaId;
    }
  } else if (effectiveStatus === "FAILED") {
    const targetSender = resolveTargetSender(senders, shop.waba_phone_number_id);
    console.log(
      JSON.stringify({
        event: "infobip_embedded_signup_failed",
        businessAccountId: wabaId,
        registrationInfo: payload.registrationInfo ?? null,
        senderRegistrationInfo: targetSender?.registrationInfo ?? null,
      }),
    );
    update.waba_connect_status = "error";
    update.waba_connected_at = null;
  } else if (effectiveStatus === "FINISHED") {
    const targetSender = resolveTargetSender(senders, shop.waba_phone_number_id);

    update.waba_connect_status = "connected";
    update.waba_connected_at = parseConnectedAt(payload.lastModifiedAt);
    update.waba_id = wabaId;

    if (targetSender?.phoneNumberId) {
      update.waba_phone_number_id = String(targetSender.phoneNumberId).trim();
    }

    if (targetSender?.displayPhoneNumber) {
      update.infobip_sender_number = normalizeBrazilPhoneE164Digits(targetSender.displayPhoneNumber);
    } else if (!senders.length) {
      console.warn("infobip-embedded-signup-webhook: FINISHED sem senders", { wabaId });
    }
  }

  const { error: updateErr } = await supabase
    .from("barbershops")
    .update(update)
    .eq("id", shop.id);

  if (updateErr) {
    console.error("infobip-embedded-signup-webhook: falha UPDATE", updateErr.message);
    return jsonResponse({ error: "Internal server error" }, 500);
  }

  return jsonResponse({ success: true });
});
