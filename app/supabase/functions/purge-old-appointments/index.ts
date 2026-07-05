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

    return jsonResponse({ deleted: 0, note: "Retenção ilimitada — purge desativado." });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro inesperado";
    console.error("[purge-old-appointments]", message);
    return jsonResponse({ error: message }, 500);
  }
});
