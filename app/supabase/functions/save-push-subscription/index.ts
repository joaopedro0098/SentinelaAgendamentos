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
    const agendamentoId = String(body.agendamento_id ?? "");
    const endpoint = String(body.endpoint ?? "");
    const p256dh = String(body.keys?.p256dh ?? "");
    const auth = String(body.keys?.auth ?? "");

    if (!agendamentoId || !endpoint || !p256dh || !auth) {
      return jsonResponse({ error: "Dados da inscrição push incompletos." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: appointment } = await supabase
      .from("agendamentos")
      .select("id, status")
      .eq("id", agendamentoId)
      .maybeSingle();

    if (!appointment || appointment.status !== "confirmado") {
      return jsonResponse({ error: "Agendamento não encontrado." }, 404);
    }

    const { error } = await supabase
      .from("appointment_push_subscriptions")
      .upsert(
        {
          agendamento_id: agendamentoId,
          endpoint,
          p256dh,
          auth,
          user_agent: req.headers.get("user-agent"),
          failed_at: null,
          failure_reason: null,
        },
        { onConflict: "agendamento_id,endpoint" },
      );

    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ ok: true });
  } catch (error) {
    console.error("save-push-subscription:", error);
    return jsonResponse({ error: "Não foi possível salvar o lembrete push." }, 500);
  }
});
