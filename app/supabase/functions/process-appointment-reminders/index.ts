import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isCronAuthorized } from "../_shared/cronAuth.ts";
import { sendDueClientReminderWhatsApp } from "../_shared/whatsappAppointmentReminders.ts";
import {
  registrarOkTwilioTemplateD1,
  registrarSkipTwilioTemplateD1Ausente,
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

    let whatsappResult: unknown = { skipped: true, reason: "templates_disabled_or_not_configured" };
    const templateSendEnabled = Deno.env.get("WHATSAPP_TEMPLATE_SEND_ENABLED") === "true";
    const hasTwilioTemplate = Boolean(Deno.env.get("TWILIO_CONTENT_SID_REMINDER")?.trim());
    const hasInfobipTemplate = Boolean(Deno.env.get("INFOBIP_TEMPLATE_REMINDER")?.trim());

    if (templateSendEnabled || hasTwilioTemplate || hasInfobipTemplate) {
      if (hasTwilioTemplate) {
        await registrarOkTwilioTemplateD1(supabase);
      }
      try {
        whatsappResult = await sendDueClientReminderWhatsApp(supabase);
      } catch (whatsappError) {
        console.error(
          "process-appointment-reminders: falha no lembrete WhatsApp:",
          whatsappError instanceof Error ? whatsappError.message : whatsappError,
        );
        whatsappResult = {
          error: whatsappError instanceof Error ? whatsappError.message : "Falha ao enviar lembrete WhatsApp",
        };
      }
    } else if (!hasTwilioTemplate && !hasInfobipTemplate) {
      console.warn(
        "process-appointment-reminders: lembrete D-1 WhatsApp ignorado — nenhum template configurado (Twilio ou Infobip).",
      );
      await registrarSkipTwilioTemplateD1Ausente(supabase);
    } else if (!templateSendEnabled) {
      console.info(
        "process-appointment-reminders: WHATSAPP_TEMPLATE_SEND_ENABLED != true — lembrete D-1 não enviado (aguardando aprovação).",
      );
    }

    const { data: canceledCount } = await supabase.rpc("cancel_unconfirmed_appointments");

    return jsonResponse({
      ok: true,
      reminder_whatsapp_d1: whatsappResult,
      canceled: canceledCount ?? 0,
    });
  } catch (error) {
    console.error("process-appointment-reminders:", error);
    return jsonResponse({ error: "Não foi possível processar manutenção de agendamentos." }, 500);
  }
});
