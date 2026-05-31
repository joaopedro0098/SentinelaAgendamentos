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
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return jsonResponse({ error: "Não autorizado." }, 401);

    const body = await req.json();
    const endpoint = String(body.endpoint ?? "");
    const p256dh = String(body.keys?.p256dh ?? "");
    const auth = String(body.keys?.auth ?? "");

    if (!endpoint || !p256dh || !auth) {
      return jsonResponse({ error: "Dados da inscrição push incompletos." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return jsonResponse({ error: "Não autorizado." }, 401);
    }

    const { data: barbearia, error: barbeariaError } = await supabase
      .from("barbearias")
      .select("id")
      .eq("owner_id", userData.user.id)
      .maybeSingle();

    if (barbeariaError) return jsonResponse({ error: barbeariaError.message }, 500);
    if (!barbearia) return jsonResponse({ error: "Barbearia não encontrada." }, 404);

    const { error } = await supabase
      .from("barber_push_subscriptions")
      .upsert(
        {
          barbearia_id: barbearia.id,
          user_id: userData.user.id,
          endpoint,
          p256dh,
          auth,
          user_agent: req.headers.get("user-agent"),
          failed_at: null,
          failure_reason: null,
        },
        { onConflict: "barbearia_id,endpoint" },
      );

    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ ok: true });
  } catch (error) {
    console.error("save-barber-push-subscription:", error);
    return jsonResponse({ error: "Não foi possível salvar a inscrição push." }, 500);
  }
});
