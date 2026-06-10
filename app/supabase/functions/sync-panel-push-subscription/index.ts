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

/** Sincroniza inscrição push do cliente em agendamento criado pelo painel (origem painel). */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405);

  try {
    const body = await req.json();
    const agendamentoId = String(body.agendamento_id ?? "").trim();
    if (!agendamentoId) {
      return jsonResponse({ error: "agendamento_id é obrigatório." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: appointment, error: appointmentError } = await supabase
      .from("agendamentos")
      .select("id, origem, requires_client_confirmation")
      .eq("id", agendamentoId)
      .maybeSingle();

    if (appointmentError) return jsonResponse({ error: appointmentError.message }, 500);
    if (!appointment) return jsonResponse({ error: "Agendamento não encontrado." }, 404);

    if (appointment.origem !== "painel" || !appointment.requires_client_confirmation) {
      return jsonResponse({ ok: true, skipped: true, reason: "not_panel_booking" });
    }

    const { data: inherited, error: inheritError } = await supabase.rpc(
      "inherit_appointment_push_subscription",
      { _agendamento_id: agendamentoId, _force_refresh: true },
    );

    if (inheritError) return jsonResponse({ error: inheritError.message }, 500);

    const { count, error: countError } = await supabase
      .from("appointment_push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("agendamento_id", agendamentoId)
      .is("failed_at", null);

    if (countError) return jsonResponse({ error: countError.message }, 500);

    return jsonResponse({
      ok: true,
      inherited: Boolean(inherited),
      active_subscriptions: count ?? 0,
    });
  } catch (error) {
    console.error("sync-panel-push-subscription:", error);
    return jsonResponse({ error: "Não foi possível sincronizar push do painel." }, 500);
  }
});
