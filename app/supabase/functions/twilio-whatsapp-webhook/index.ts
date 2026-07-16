/**
 * POST /twilio-whatsapp-webhook
 *
 * Recebe respostas dos pacientes (Twilio) e enfileira para processamento assíncrono.
 * Responde TwiML vazio o mais rápido possível — a lógica de negócio roda no worker
 * process-whatsapp-webhook-jobs.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { phoneDigitsFromWhatsAppAddress, verifyTwilioSignature } from "../_shared/twilioWhatsapp.ts";
import { enqueueInboundWhatsAppReply } from "../_shared/whatsappWebhookQueue.ts";

const EMPTY_TWIML = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;

function twimlResponse(status = 200) {
  return new Response(EMPTY_TWIML, {
    status,
    headers: { "Content-Type": "text/xml" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return twimlResponse(405);

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return twimlResponse(400);
  }

  const formParams = Object.fromEntries(new URLSearchParams(rawBody));

  const webhookUrl = Deno.env.get("TWILIO_WEBHOOK_URL")?.trim() || req.url;
  const signatureHeader = req.headers.get("X-Twilio-Signature");
  const signatureOk = await verifyTwilioSignature({ signatureHeader, webhookUrl, formParams }).catch(() => false);
  if (!signatureOk) {
    console.error("twilio-whatsapp-webhook: assinatura inválida");
    return twimlResponse(403);
  }

  const inboundMessageSid = (formParams["MessageSid"] ?? "").trim();
  const from = formParams["From"] ?? "";
  const body = (formParams["Body"] ?? "").trim();
  const telefoneDigits = phoneDigitsFromWhatsAppAddress(from);

  console.log(
    "twilio-whatsapp-webhook: assinatura válida — mensagem recebida",
    JSON.stringify({ From: from, Body: body, MessageSid: inboundMessageSid, telefoneDigits }),
  );

  if (!inboundMessageSid) {
    console.error("twilio-whatsapp-webhook: MessageSid ausente");
    return twimlResponse();
  }
  if (!telefoneDigits) {
    return twimlResponse();
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const enqueueResult = await enqueueInboundWhatsAppReply(supabase, {
    inboundMessageSid,
    telefone: telefoneDigits,
    body,
  });

  if (!enqueueResult.ok) {
    console.error("twilio-whatsapp-webhook: falha ao enfileirar:", enqueueResult.error);
    // Mesmo em erro de fila, 200 evita retry storm da Twilio; o job não foi criado.
    return twimlResponse();
  }

  if (enqueueResult.duplicate) {
    console.log(
      "twilio-whatsapp-webhook: job duplicado (MessageSid já enfileirado)",
      JSON.stringify({ inboundMessageSid }),
    );
    // Idempotência: MessageSid já enfileirado anteriormente.
    return twimlResponse();
  }

  console.log(
    "twilio-whatsapp-webhook: job enfileirado com sucesso",
    JSON.stringify({ jobId: enqueueResult.jobId, inboundMessageSid, telefoneDigits, Body: body }),
  );

  return twimlResponse();
});
