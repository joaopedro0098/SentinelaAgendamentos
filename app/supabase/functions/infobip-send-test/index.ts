/**
 * POST /infobip-send-test
 *
 * Teste isolado de conexão Infobip (mensagens de SESSÃO, sem template aprovado).
 * Protegido por isCronAuthorized (service role / REMINDER_CRON_SECRET).
 *
 * Body JSON:
 * {
 *   "to": "5511999999999",           // opcional — default INFOBIP_TEST_RECIPIENT
 *   "mode": "text" | "interactive",  // default "text"
 *   "text": "...",                   // mode=text
 *   "bodyText": "...",               // mode=interactive
 *   "buttons": [{ "id": "confirmar...", "title": "Confirmar" }, ...]
 * }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isCronAuthorized } from "../_shared/cronAuth.ts";
import {
  sendWhatsAppInteractiveButtons,
  sendWhatsAppSessionText,
} from "../_shared/infobipWhatsapp.ts";
import { normalizeBrazilPhoneE164Digits } from "../_shared/twilioWhatsapp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type TestBody = {
  to?: string;
  mode?: "text" | "interactive";
  text?: string;
  bodyText?: string;
  buttons?: Array<{ id: string; title: string }>;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  if (!isCronAuthorized(req)) {
    return jsonResponse({ error: "Não autorizado." }, 401);
  }

  // Valida que Supabase está acessível (smoke test de env)
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: TestBody = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const defaultRecipient = Deno.env.get("INFOBIP_TEST_RECIPIENT")?.trim();
  const toRaw = (body.to ?? defaultRecipient ?? "").trim();
  if (!toRaw) {
    return jsonResponse({
      error: "Informe 'to' no body ou configure INFOBIP_TEST_RECIPIENT.",
    }, 400);
  }

  const to = normalizeBrazilPhoneE164Digits(toRaw);
  const mode = body.mode ?? "text";

  try {
    if (mode === "interactive") {
      const buttons = body.buttons ?? [
        {
          id: "confirmar00000000-0000-4000-8000-000000000001",
          title: "Confirmar",
        },
        {
          id: "cancelar00000000-0000-4000-8000-000000000001",
          title: "Cancelar",
        },
      ];

      const result = await sendWhatsAppInteractiveButtons({
        to,
        bodyText: body.bodyText ?? "Teste Sentinela — clique em um botão para validar o webhook inbound.",
        buttons,
        messageId: `sentinela-test-${crypto.randomUUID()}`,
        callbackData: "infobip-send-test-interactive",
      });

      return jsonResponse({
        ok: true,
        mode: "interactive",
        to,
        messageId: result.messageId,
        status: result.status,
        buttons,
        hint: "Clique em um botão e verifique whatsapp_webhook_jobs + logs do infobip-whatsapp-webhook.",
      });
    }

    const result = await sendWhatsAppSessionText({
      to,
      text: body.text ?? "Teste Sentinela Agendamentos — conexão Infobip OK (mensagem de sessão).",
      messageId: `sentinela-test-${crypto.randomUUID()}`,
      callbackData: "infobip-send-test-text",
    });

    return jsonResponse({
      ok: true,
      mode: "text",
      to,
      messageId: result.messageId,
      status: result.status,
    });
  } catch (error) {
    console.error("infobip-send-test:", error);
    return jsonResponse({
      error: error instanceof Error ? error.message : "Falha ao enviar mensagem de teste.",
    }, 500);
  }
});
