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
    const requestSecret =
      req.headers.get("x-cron-secret") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (cronSecret && requestSecret !== cronSecret) {
      return jsonResponse({ error: "Não autorizado." }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase.rpc("purge_old_agendamentos");
    if (error) {
      console.error("[purge-old-appointments]", error.message);
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({ deleted: data ?? 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro inesperado";
    console.error("[purge-old-appointments]", message);
    return jsonResponse({ error: message }, 500);
  }
});
