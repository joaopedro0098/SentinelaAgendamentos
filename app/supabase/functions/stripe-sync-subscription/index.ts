import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { applyStripeSubscriptionToShop, getStripe } from "../_shared/stripeBilling.ts";

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
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) return jsonResponse({ error: "Sessão inválida" }, 401);

    const stripe = getStripe();

    const { data: shop } = await supabase
      .from("barbershops")
      .select("id, stripe_subscription_id")
      .eq("owner_id", userData.user.id)
      .maybeSingle();

    if (!shop?.stripe_subscription_id) {
      return jsonResponse({ ok: true, synced: false });
    }

    const subscription = await stripe.subscriptions.retrieve(shop.stripe_subscription_id);
    await applyStripeSubscriptionToShop(supabase, shop.id, subscription);

    const { data: subscriptionInfo } = await userClient.rpc("get_my_subscription");
    return jsonResponse({ ok: true, synced: true, subscription: subscriptionInfo });
  } catch (e) {
    console.error("stripe-sync-subscription:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
