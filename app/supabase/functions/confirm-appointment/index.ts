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
    const { token, action } = await req.json();
    if (!token) return jsonResponse({ error: "Token inválido." }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: appointment, error } = await supabase
      .from("agendamentos")
      .select("id, data, hora, cliente_nome, status, client_confirmed_at, barbearias(nome), barbeiros(nome)")
      .eq("confirmation_token", token)
      .maybeSingle();

    if (error) return jsonResponse({ error: error.message }, 500);
    if (!appointment) return jsonResponse({ error: "Agendamento não encontrado." }, 404);

    if (appointment.status !== "confirmado") {
      return jsonResponse({
        error: "Este agendamento não está mais disponível para confirmação.",
        appointment,
      }, 409);
    }

    if (action === "confirm") {
      const { data: updated, error: updateError } = await supabase
        .from("agendamentos")
        .update({ client_confirmed_at: new Date().toISOString() })
        .eq("id", appointment.id)
        .eq("status", "confirmado")
        .select("id, data, hora, cliente_nome, status, client_confirmed_at, barbearias(nome), barbeiros(nome)")
        .single();

      if (updateError) return jsonResponse({ error: updateError.message }, 500);
      return jsonResponse({ ok: true, appointment: updated });
    }

    return jsonResponse({ ok: true, appointment });
  } catch (error) {
    console.error("confirm-appointment:", error);
    return jsonResponse({ error: "Não foi possível confirmar o agendamento." }, 500);
  }
});
