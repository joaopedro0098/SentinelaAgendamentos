import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isCronAuthorized } from "../_shared/cronAuth.ts";
import { configureWebPush } from "../_shared/webPush.ts";
import { sendDueClientConfirmationPushes } from "../_shared/clientConfirmationPush.ts";
import { sendDueClientReminderWhatsApp } from "../_shared/whatsappAppointmentReminders.ts";

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

    let force = false;
    if (req.method === "POST") {
      try {
        const body = await req.clone().json();
        force = Boolean(body?.force);
      } catch {
        force = false;
      }
    }

    configureWebPush();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const pushResult = await sendDueClientConfirmationPushes(supabase, { force });

    // Lembrete D-1 via WhatsApp (Twilio) roda em paralelo ao Web Push. Só dispara se o
    // Content Template já estiver configurado — enquanto não estiver, fica um no-op.
    let whatsappResult: unknown = { skipped: true, reason: "twilio_not_configured" };
    if (Deno.env.get("TWILIO_CONTENT_SID_REMINDER")?.trim() && !pushResult.skipped) {
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
    }

    const { data: canceledCount } = await supabase.rpc("cancel_unconfirmed_appointments");

    return jsonResponse({
      ok: true,
      confirmation_pushes: pushResult,
      confirmation_whatsapp: whatsappResult,
      canceled: canceledCount ?? 0,
    });
  } catch (error) {
    console.error("process-appointment-reminders:", error);
    return jsonResponse({ error: "Não foi possível processar manutenção de agendamentos." }, 500);
  }
});
