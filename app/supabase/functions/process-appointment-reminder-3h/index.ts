import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isCronAuthorized } from "../_shared/cronAuth.ts";
import { sendDueReminder3hWhatsApp } from "../_shared/whatsappReminder3h.ts";
import { sendDueMetaReminder3hWhatsApp } from "../_shared/metaWhatsappReminder3h.ts";
import { finalizePendingTemplateDeletionsGlobal } from "../_shared/metaWabaTemplatesService.ts";
import {
  CRON_LEASE_JOB_REMINDER_3H,
  releaseCronJobLease,
  tryAcquireCronJobLease,
} from "../_shared/cronJobLease.ts";
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

    const leaseAcquired = await tryAcquireCronJobLease(supabase, CRON_LEASE_JOB_REMINDER_3H);
    if (!leaseAcquired) {
      console.info("process-appointment-reminder-3h: execução anterior ainda ativa — skip.");
      return jsonResponse({ ok: true, skipped: true, reason: "cron_lease_busy" });
    }

    try {
    const templateSendEnabled = Deno.env.get("WHATSAPP_TEMPLATE_SEND_ENABLED") === "true";
    const hasTwilioTemplate = Boolean(Deno.env.get("TWILIO_CONTENT_SID_LEMBRETE_3H")?.trim());
    const hasInfobipTemplate = Boolean(Deno.env.get("INFOBIP_TEMPLATE_LEMBRETE_3H")?.trim());

    let reminder3hResult: unknown = { skipped: true, reason: "templates_disabled_or_not_configured" };
    let metaReminder3hResult: unknown = { skipped: true, reason: "templates_disabled" };

    if (templateSendEnabled) {
      try {
        metaReminder3hResult = await sendDueMetaReminder3hWhatsApp(supabase);
      } catch (metaError) {
        console.error(
          "process-appointment-reminder-3h: falha no lembrete WhatsApp Meta ~3h:",
          metaError instanceof Error ? metaError.message : metaError,
        );
        metaReminder3hResult = {
          error: metaError instanceof Error ? metaError.message : "Falha ao enviar lembrete Meta ~3h",
        };
      }
    } else {
      console.info(
        "process-appointment-reminder-3h: WHATSAPP_TEMPLATE_SEND_ENABLED != true — lembrete Meta ~3h não enviado.",
      );
    }

    if (templateSendEnabled || hasTwilioTemplate || hasInfobipTemplate) {
      if (hasTwilioTemplate) {
        await registrarOkTwilioTemplate3h(supabase);
      }
      try {
        reminder3hResult = await sendDueReminder3hWhatsApp(supabase);
      } catch (whatsappError) {
        console.error(
          "process-appointment-reminder-3h: falha no lembrete WhatsApp legado:",
          whatsappError instanceof Error ? whatsappError.message : whatsappError,
        );
        reminder3hResult = {
          error: whatsappError instanceof Error ? whatsappError.message : "Falha ao enviar lembrete WhatsApp",
        };
      }
    } else if (!hasTwilioTemplate && !hasInfobipTemplate) {
      console.warn(
        "process-appointment-reminder-3h: lembrete ~3h legado ignorado — nenhum template Twilio/Infobip configurado.",
      );
      await registrarSkipTwilioTemplate3hAusente(supabase);
    } else if (!templateSendEnabled) {
      console.info(
        "process-appointment-reminder-3h: WHATSAPP_TEMPLATE_SEND_ENABLED != true — lembrete ~3h legado não enviado.",
      );
    }

    try {
      await finalizePendingTemplateDeletionsGlobal(supabase);
    } catch (finalizeErr) {
      console.error("process-appointment-reminder-3h: finalize template deletions:", finalizeErr);
    }

    return jsonResponse({
      ok: true,
      reminder_3h_whatsapp_meta: metaReminder3hResult,
      reminder_3h_whatsapp: reminder3hResult,
    });
    } finally {
      await releaseCronJobLease(supabase, CRON_LEASE_JOB_REMINDER_3H);
    }
  } catch (error) {
    console.error("process-appointment-reminder-3h:", error);
    return jsonResponse({ error: "Não foi possível processar lembretes 3h." }, 500);
  }
});
