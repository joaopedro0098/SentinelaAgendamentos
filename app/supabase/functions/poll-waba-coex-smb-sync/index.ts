/**
 * Worker cron: retenta POST smb_app_data (coexistência) dentro da janela de 24h pós-conexão.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isCronAuthorized } from "../_shared/cronAuth.ts";
import { retryCoexistenceSyncForEligibleShops } from "../_shared/metaWabaConnect.ts";

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

    const result = await retryCoexistenceSyncForEligibleShops(supabase);

    return jsonResponse({ ok: true, ...result });
  } catch (error) {
    console.error("[poll-waba-coex-smb-sync] Erro interno:", error);
    return jsonResponse({
      error: error instanceof Error ? error.message : "Falha no retry smb_app_data coexistência.",
    }, 500);
  }
});
