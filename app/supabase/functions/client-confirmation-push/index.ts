import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405);

  try {
    const body = await req.json();
    const confirmationToken = String(body.confirmation_token ?? "").trim();
    const endpoint = String(body.endpoint ?? "");
    const p256dh = String(body.keys?.p256dh ?? "");
    const auth = String(body.keys?.auth ?? "");

    if (!confirmationToken) {
      return jsonResponse({ error: "confirmation_token é obrigatório." }, 400);
    }
    if (!endpoint || !p256dh || !auth) {
      return jsonResponse({ error: "Dados da inscrição push incompletos." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: appointment, error: appointmentError } = await supabase
      .from("agendamentos")
      .select("id, status, requires_client_confirmation, client_confirmed_at")
      .eq("confirmation_token", confirmationToken)
      .maybeSingle();

    if (appointmentError) return jsonResponse({ error: appointmentError.message }, 500);
    if (!appointment) return jsonResponse({ error: "Agendamento não encontrado." }, 404);

    if (appointment.status !== "confirmado" || !appointment.requires_client_confirmation) {
      return jsonResponse({ ok: true, skipped: true, reason: "not_eligible" });
    }

    if (appointment.client_confirmed_at) {
      return jsonResponse({ ok: true, skipped: true, reason: "already_confirmed" });
    }

    const { error: upsertError } = await supabase.from("appointment_push_subscriptions").upsert(
      {
        agendamento_id: appointment.id,
        endpoint,
        p256dh,
        auth,
        user_agent: req.headers.get("user-agent"),
        failed_at: null,
        failure_reason: null,
      },
      { onConflict: "agendamento_id,endpoint" },
    );

    if (upsertError) return jsonResponse({ error: upsertError.message }, 500);

    await supabase
      .from("agendamentos")
      .update({ requires_client_confirmation: true })
      .eq("id", appointment.id);

    return jsonResponse({ ok: true, subscribed: true });
  } catch (error) {
    console.error("client-confirmation-push:", error);
    return jsonResponse({ error: "Não foi possível salvar a inscrição push." }, 500);
  }
});
