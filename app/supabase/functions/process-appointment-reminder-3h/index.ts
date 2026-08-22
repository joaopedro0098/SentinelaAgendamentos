import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isCronAuthorized } from "../_shared/cronAuth.ts";
import { sendDueReminder3hWhatsApp } from "../_shared/whatsappReminder3h.ts";
import {
  registrarOkTwilioTemplate3h,
  registrarSkipTwilioTemplate3hAusente,
} from "../_shared/integracaoAlertas.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!isCronAuthorized(req)) {
      return jsonResponse({ error: "Não autorizado." }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let reminder3hResult: unknown = { skipped: true, reason: "templates_disabled_or_not_configured" };
    const templateSendEnabled = Deno.env.get("WHATSAPP_TEMPLATE_SEND_ENABLED") === "true";
    const hasTwilioTemplate = Boolean(Deno.env.get("TWILIO_CONTENT_SID_LEMBRETE_3H")?.trim());
    const hasInfobipTemplate = Boolean(Deno.env.get("INFOBIP_TEMPLATE_LEMBRETE_3H")?.trim());

    if (templateSendEnabled || hasTwilioTemplate || hasInfobipTemplate) {
      if (hasTwilioTemplate) {
        await registrarOkTwilioTemplate3h(supabase);
      }
      try {
        reminder3hResult = await sendDueReminder3hWhatsApp(supabase);
      } catch (whatsappError) {
        console.error(
          "process-appointment-reminder-3h: falha no lembrete WhatsApp:",
          whatsappError instanceof Error ? whatsappError.message : whatsappError,
        );
        reminder3hResult = {
          error: whatsappError instanceof Error ? whatsappError.message : "Falha ao enviar lembrete WhatsApp",
        };
      }
    } else if (!hasTwilioTemplate && !hasInfobipTemplate) {
      console.warn(
        "process-appointment-reminder-3h: lembrete ~3h WhatsApp ignorado — nenhum template configurado (Twilio ou Infobip).",
      );
      await registrarSkipTwilioTemplate3hAusente(supabase);
    } else if (!templateSendEnabled) {
      console.info(
        "process-appointment-reminder-3h: WHATSAPP_TEMPLATE_SEND_ENABLED != true — lembrete ~3h não enviado (aguardando aprovação).",
      );
    }

    return jsonResponse({ ok: true, reminder_3h_whatsapp: reminder3hResult });
  } catch (error) {
    console.error("process-appointment-reminder-3h:", error);
    return jsonResponse({ error: "Não foi possível processar lembretes 3h." }, 500);
  }
});
