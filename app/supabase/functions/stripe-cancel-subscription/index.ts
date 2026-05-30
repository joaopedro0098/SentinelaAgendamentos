import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getStripe } from "../_shared/stripeBilling.ts";

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

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Não autenticado" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) return jsonResponse({ error: "Token inválido" }, 401);

    const { data: shop } = await supabase
      .from("barbershops")
      .select("id, stripe_subscription_id, subscription_status")
      .eq("owner_id", userData.user.id)
      .maybeSingle();

    if (!shop?.stripe_subscription_id) {
      return jsonResponse({ error: "Nenhuma assinatura com cartão ativa encontrada." }, 404);
    }

    const stripe = getStripe();
    await stripe.subscriptions.update(shop.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    const notice = "Assinatura cancelada. O acesso continua até o fim do período já pago.";
    await supabase
      .from("barbershops")
      .update({ subscription_notice: notice })
      .eq("id", shop.id);

    return jsonResponse({ ok: true });
  } catch (e) {
    console.error("stripe-cancel-subscription:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
