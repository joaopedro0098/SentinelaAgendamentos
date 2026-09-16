import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isCronAuthorized } from "../_shared/cronAuth.ts";
import { sendDueClientReminderWhatsApp } from "../_shared/whatsappAppointmentReminders.ts";
import { sendDueMetaClientReminderWhatsApp } from "../_shared/metaWhatsappAppointmentReminders.ts";
import { finalizePendingTemplateDeletionsGlobal } from "../_shared/metaWabaTemplatesService.ts";
import {
  CRON_LEASE_JOB_REMINDER_D1,
  releaseCronJobLease,
  tryAcquireCronJobLease,
} from "../_shared/cronJobLease.ts";
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

    const leaseAcquired = await tryAcquireCronJobLease(supabase, CRON_LEASE_JOB_REMINDER_D1);
    if (!leaseAcquired) {
      console.info("process-appointment-reminders: execução anterior ainda ativa — skip.");
      return jsonResponse({ ok: true, skipped: true, reason: "cron_lease_busy" });
    }

    try {
    const templateSendEnabled = Deno.env.get("WHATSAPP_TEMPLATE_SEND_ENABLED") === "true";
    const hasTwilioTemplate = Boolean(Deno.env.get("TWILIO_CONTENT_SID_REMINDER")?.trim());
    const hasInfobipTemplate = Boolean(Deno.env.get("INFOBIP_TEMPLATE_REMINDER")?.trim());

    let whatsappResult: unknown = { skipped: true, reason: "templates_disabled_or_not_configured" };
    let metaWhatsappResult: unknown = { skipped: true, reason: "templates_disabled" };

    if (templateSendEnabled) {
      try {
        metaWhatsappResult = await sendDueMetaClientReminderWhatsApp(supabase);
      } catch (metaError) {
        console.error(
          "process-appointment-reminders: falha no lembrete WhatsApp Meta D-1:",
          metaError instanceof Error ? metaError.message : metaError,
        );
        metaWhatsappResult = {
          error: metaError instanceof Error ? metaError.message : "Falha ao enviar lembrete Meta D-1",
        };
      }
    } else {
      console.info(
        "process-appointment-reminders: WHATSAPP_TEMPLATE_SEND_ENABLED != true — lembrete Meta D-1 não enviado.",
      );
    }

    if (templateSendEnabled || hasTwilioTemplate || hasInfobipTemplate) {
      if (hasTwilioTemplate) {
        await registrarOkTwilioTemplateD1(supabase);
      }
      try {
        whatsappResult = await sendDueClientReminderWhatsApp(supabase);
      } catch (whatsappError) {
        console.error(
          "process-appointment-reminders: falha no lembrete WhatsApp legado:",
          whatsappError instanceof Error ? whatsappError.message : whatsappError,
        );
        whatsappResult = {
          error: whatsappError instanceof Error ? whatsappError.message : "Falha ao enviar lembrete WhatsApp",
        };
      }
    } else if (!hasTwilioTemplate && !hasInfobipTemplate) {
      console.warn(
        "process-appointment-reminders: lembrete D-1 legado ignorado — nenhum template Twilio/Infobip configurado.",
      );
      await registrarSkipTwilioTemplateD1Ausente(supabase);
    } else if (!templateSendEnabled) {
      console.info(
        "process-appointment-reminders: WHATSAPP_TEMPLATE_SEND_ENABLED != true — lembrete D-1 legado não enviado.",
      );
    }

    const { data: canceledCount } = await supabase.rpc("cancel_unconfirmed_appointments");

    try {
      await finalizePendingTemplateDeletionsGlobal(supabase);
    } catch (finalizeErr) {
      console.error("process-appointment-reminders: finalize template deletions:", finalizeErr);
    }

    return jsonResponse({
      ok: true,
      reminder_whatsapp_d1_meta: metaWhatsappResult,
      reminder_whatsapp_d1: whatsappResult,
      canceled: canceledCount ?? 0,
    });
    } finally {
      await releaseCronJobLease(supabase, CRON_LEASE_JOB_REMINDER_D1);
    }
  } catch (error) {
    console.error("process-appointment-reminders:", error);
    return jsonResponse({ error: "Não foi possível processar manutenção de agendamentos." }, 500);
  }
});
