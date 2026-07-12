import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getStripeClient } from "../_shared/stripePlatformBilling.ts";

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

    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
    if (isAdmin) return jsonResponse({ error: "Conta administrativa não possui assinatura." }, 400);

    const { data: shop } = await supabase
      .from("barbershops")
      .select("id, subscription_status, stripe_subscription_id, current_period_end")
      .eq("owner_id", userData.user.id)
      .maybeSingle();

    if (!shop) return jsonResponse({ error: "Empresa não encontrada" }, 404);

    if (shop.subscription_status !== "active") {
      return jsonResponse({ error: "Não há assinatura ativa para cancelar." }, 400);
    }

    if (!shop.stripe_subscription_id?.trim()) {
      return jsonResponse({ error: "Esta assinatura não é recorrente por cartão (Stripe)." }, 400);
    }

    const stripe = getStripeClient();
    await stripe.subscriptions.update(shop.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    await supabase
      .from("barbershops")
      .update({
        subscription_status: "cancelled",
        subscription_notice: "Assinatura cancelada. O acesso continua até o fim do período já pago.",
      })
      .eq("id", shop.id);

    const { data: subscription } = await userClient.rpc("get_my_subscription");

    return jsonResponse({
      ok: true,
      subscription_status: "cancelled",
      current_period_end: shop.current_period_end,
      subscription,
    });
  } catch (e) {
    console.error("stripe-cancel-subscription:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
