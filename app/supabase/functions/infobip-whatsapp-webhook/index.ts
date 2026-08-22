/**
 * POST /infobip-whatsapp-webhook
 *
 * Recebe mensagens inbound da Infobip e enfileira para processamento assíncrono.
 * Mesma fila e worker do adapter Twilio (whatsapp_webhook_jobs + process-whatsapp-webhook-jobs).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verifyInfobipWebhook } from "../_shared/infobipWebhookAuth.ts";
import {
  parseInfobipWebhookPayload,
  type InfobipWebhookPayload,
} from "../_shared/infobipInboundParser.ts";
import { enqueueInboundWhatsAppReply } from "../_shared/whatsappWebhookQueue.ts";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authOk = await verifyInfobipWebhook(req);
  if (!authOk) {
    console.error("infobip-whatsapp-webhook: autenticação inválida");
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return jsonResponse({ error: "Invalid body" }, 400);
  }

  let payload: InfobipWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as InfobipWebhookPayload;
  } catch {
    console.error("infobip-whatsapp-webhook: JSON inválido", rawBody.slice(0, 500));
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  console.log(
    "infobip-whatsapp-webhook: payload recebido (auth ok)",
    JSON.stringify({ messageCount: payload.messageCount, resultsLength: payload.results?.length ?? 0 }),
  );

  const inboundItems = parseInfobipWebhookPayload(payload);
  if (inboundItems.length === 0) {
    // Delivery/seen ou evento não-inbound — 200 para evitar retry storm
    return jsonResponse({ status: "ok", enqueued: 0 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let enqueued = 0;
  let duplicates = 0;

  for (const item of inboundItems) {
    console.log(
      "infobip-whatsapp-webhook: processando inbound",
      JSON.stringify({
        messageId: item.messageId,
        telefoneDigits: item.telefoneDigits,
        body: item.body,
        buttonPayload: item.buttonPayload,
      }),
    );

    const enqueueResult = await enqueueInboundWhatsAppReply(supabase, {
      inboundMessageId: item.messageId,
      provider: "infobip",
      telefone: item.telefoneDigits,
      body: item.body,
      buttonPayload: item.buttonPayload,
    });

    if (!enqueueResult.ok) {
      console.error("infobip-whatsapp-webhook: falha ao enfileirar:", enqueueResult.error);
      continue;
    }

    if (enqueueResult.duplicate) {
      duplicates += 1;
      console.log(
        "infobip-whatsapp-webhook: job duplicado",
        JSON.stringify({ messageId: item.messageId }),
      );
      continue;
    }

    enqueued += 1;
    console.log(
      "infobip-whatsapp-webhook: job enfileirado",
      JSON.stringify({ jobId: enqueueResult.jobId, messageId: item.messageId }),
    );
  }

  return jsonResponse({ status: "ok", enqueued, duplicates });
});
