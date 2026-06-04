import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
    const cronSecret = Deno.env.get("REMINDER_CRON_SECRET")?.trim();
    const requestSecret = req.headers.get("x-cron-secret") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (cronSecret && requestSecret !== cronSecret) {
      return jsonResponse({ error: "Não autorizado." }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: canceledCount } = await supabase.rpc("cancel_unconfirmed_appointments");
    const { data: purgedCount } = await supabase.rpc("purge_old_agendamentos");

    return jsonResponse({
      ok: true,
      canceled: canceledCount ?? 0,
      purged: purgedCount ?? 0,
    });
  } catch (error) {
    console.error("process-appointment-reminders:", error);
    return jsonResponse({ error: "Não foi possível processar manutenção de agendamentos." }, 500);
  }
});
