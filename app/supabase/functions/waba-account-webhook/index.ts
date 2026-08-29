import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
};

/**
 * Comparação em tempo constante para evitar Timing Attacks (Side-channel attacks).
 */
function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Valida a assinatura HMAC-SHA256 enviada pela Meta no cabeçalho X-Hub-Signature-256.
 */
async function verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string): Promise<boolean> {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }
  const expectedHash = signatureHeader.slice(7).trim();

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const hashArray = Array.from(new Uint8Array(signature));
  const actualHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  return timingSafeEqualString(actualHash, expectedHash);
}

const HISTORY_DECLINED_ERROR_CODE = 2593109;

function isHistoryDeclinedPayload(value: Record<string, unknown>): boolean {
  const history = value.history;
  if (!Array.isArray(history)) return false;

  for (const chunk of history) {
    if (!chunk || typeof chunk !== "object") continue;
    const errors = (chunk as { errors?: unknown }).errors;
    if (!Array.isArray(errors)) continue;
    for (const err of errors) {
      if (!err || typeof err !== "object") continue;
      if ((err as { code?: number }).code === HISTORY_DECLINED_ERROR_CODE) return true;
    }
  }

  return false;
}

async function handleHistoryWebhookChange(
  value: Record<string, unknown>,
  entryWabaId: string,
  supabase: ReturnType<typeof createClient>,
): Promise<void> {
  const phoneNumberId = String((value.metadata as { phone_number_id?: string } | undefined)?.phone_number_id ?? "");

  if (isHistoryDeclinedPayload(value)) {
    console.log(
      `[waba-account-webhook] history: negócio recusou compartilhar histórico (code ${HISTORY_DECLINED_ERROR_CODE}), sync concluída sem dados waba=${entryWabaId} phone=${phoneNumberId}`,
    );
    return;
  }

  console.log(
    `[waba-account-webhook] history webhook recebido waba=${entryWabaId} phone=${phoneNumberId}`,
    JSON.stringify(value).slice(0, 500),
  );

  if (!phoneNumberId) return;

  const { data: shop } = await supabase
    .from("barbershops")
    .select("id")
    .eq("waba_phone_number_id", phoneNumberId)
    .maybeSingle();

  if (shop?.id) {
    console.log(`[waba-account-webhook] history associado à barbearia ${shop.id}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // 1. Handshake inicial de validação do Webhook (requisição GET da Meta)
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const expectedVerifyToken = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN");
    if (!expectedVerifyToken) {
      console.error("[waba-account-webhook] META_WEBHOOK_VERIFY_TOKEN não configurada no servidor.");
      return new Response(JSON.stringify({ error: "META_WEBHOOK_VERIFY_TOKEN não configurada." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (mode === "subscribe" && token === expectedVerifyToken && challenge) {
      console.log("[waba-account-webhook] Handshake GET verificado com sucesso.");
      return new Response(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    console.error("[waba-account-webhook] Falha na verificação de token GET:", token);
    return new Response("Forbidden", { status: 403 });
  }

  // 2. Recebimento de eventos da Meta (requisição POST)
  if (req.method === "POST") {
    try {
      const metaAppSecret = Deno.env.get("META_APP_SECRET");
      if (!metaAppSecret) {
        console.error("[waba-account-webhook] META_APP_SECRET não configurado no servidor.");
        return new Response(JSON.stringify({ error: "META_APP_SECRET não configurado." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const rawBody = await req.text();
      const signatureHeader = req.headers.get("x-hub-signature-256");

      const isValid = await verifyMetaSignature(rawBody, signatureHeader, metaAppSecret);
      if (!isValid) {
        console.error("[waba-account-webhook] Assinatura X-Hub-Signature-256 inválida.");
        return new Response(JSON.stringify({ error: "Assinatura inválida." }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const payload = JSON.parse(rawBody);

      if (payload.object !== "whatsapp_business_account") {
        return new Response(JSON.stringify({ message: "Objeto ignorado." }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, serviceRoleKey);

      for (const entry of payload.entry ?? []) {
        const entryWabaId = String(entry.id ?? "");

        for (const change of entry.changes ?? []) {
          if (change.field === "history") {
            await handleHistoryWebhookChange(change.value ?? {}, entryWabaId, supabase);
            continue;
          }

          if (change.field !== "account_update") continue;

          const value = change.value ?? {};
          const eventType = String(value.event ?? "").toUpperCase();
          const wabaInfo = value.waba_info ?? {};
          const targetWabaId = String(wabaInfo.waba_id ?? entryWabaId ?? "");

          if (!targetWabaId) continue;

          console.log(`[waba-account-webhook] Evento recebido: ${eventType} para WABA: ${targetWabaId}`);

          switch (eventType) {
            case "PARTNER_APP_UNINSTALLED":
            case "ACCOUNT_DELETED": {
              const { error } = await supabase
                .from("barbershops")
                .update({
                  waba_connect_status: "not_connected",
                  waba_connected_at: null,
                  updated_at: new Date().toISOString(),
                })
                .eq("waba_id", targetWabaId);

              if (error) console.error(`[waba-account-webhook] Erro ao atualizar ${eventType}:`, error);
              break;
            }

            case "DISABLED_UPDATE": {
              const banState = String(value.ban_info?.waba_ban_state ?? "").toUpperCase();
              const newStatus = banState === "DISABLE" ? "error" : banState === "REINSTATE" ? "connected" : "error";

              const { error } = await supabase
                .from("barbershops")
                .update({
                  waba_connect_status: newStatus,
                  updated_at: new Date().toISOString(),
                })
                .eq("waba_id", targetWabaId);

              if (error) console.error("[waba-account-webhook] Erro ao atualizar DISABLED_UPDATE:", error);
              break;
            }

            case "ACCOUNT_RESTRICTION":
            case "PARTNER_REMOVED": {
              const { error } = await supabase
                .from("barbershops")
                .update({
                  waba_connect_status: "error",
                  updated_at: new Date().toISOString(),
                })
                .eq("waba_id", targetWabaId);

              if (error) console.error(`[waba-account-webhook] Erro ao atualizar ${eventType}:`, error);
              break;
            }

            case "ACCOUNT_VIOLATION":
            case "PARTNER_ADDED":
            case "PARTNER_APP_INSTALLED": {
              console.log(`[waba-account-webhook] Log de auditoria ${eventType}:`, value);
              break;
            }

            default:
              console.log(`[waba-account-webhook] Evento account_update não mapeado: ${eventType}`);
              break;
          }
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e) {
      console.error("[waba-account-webhook] Erro interno:", e);
      return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Method Not Allowed", { status: 405 });
});
