import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  getOrCreateStripeCustomer,
  getStripeClient,
  getStripePriceId,
  normalizeSubscriptionTier,
  paymentIntentClientSecret,
  syncShopFromStripeSubscription,
  type SubscriptionTier,
} from "../_shared/stripePlatformBilling.ts";

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
    if (userErr || !userData.user) return jsonResponse({ error: "Sessão inválida" }, 401);
    const user = userData.user;

    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (isAdmin) return jsonResponse({ error: "Conta administrativa não requer assinatura." }, 400);

    if (!user.email?.trim()) {
      return jsonResponse({ error: "Sua conta precisa de um e-mail válido para assinar." }, 400);
    }

    const body = (await req.json().catch(() => ({}))) as { tier?: string };
    const tier = normalizeSubscriptionTier(body.tier);
    if (!tier) return jsonResponse({ error: "Plano inválido. Escolha Start ou Pro." }, 400);

    const { data: shop } = await supabase
      .from("barbershops")
      .select(
        "id, display_name, subscription_status, subscription_tier, stripe_customer_id, stripe_subscription_id, mp_subscription_id",
      )
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!shop) return jsonResponse({ error: "Empresa não encontrada" }, 404);

    const stripe = getStripeClient();
    const priceId = getStripePriceId(tier);

    if (shop.subscription_status === "active" && shop.subscription_tier === "pro") {
      return jsonResponse({ error: "Você já possui o plano Pro ativo." }, 400);
    }

    if (
      shop.subscription_status === "active" &&
      shop.subscription_tier === "start" &&
      tier === "start"
    ) {
      return jsonResponse({ error: "Você já possui o plano Start ativo." }, 400);
    }

    if (
      shop.subscription_status === "active" &&
      shop.subscription_tier === "start" &&
      tier === "pro" &&
      shop.stripe_subscription_id
    ) {
      const existing = await stripe.subscriptions.retrieve(shop.stripe_subscription_id, {
        expand: ["latest_invoice.payment_intent"],
      });
      const itemId = existing.items.data[0]?.id;
      if (!itemId) return jsonResponse({ error: "Assinatura Stripe inválida." }, 502);

      const upgraded = await stripe.subscriptions.update(shop.stripe_subscription_id, {
        items: [{ id: itemId, price: getStripePriceId("pro") }],
        proration_behavior: "always_invoice",
        metadata: { shop_id: shop.id, tier: "pro" },
        expand: ["latest_invoice.payment_intent"],
      });

      await syncShopFromStripeSubscription(supabase, shop.id, upgraded);

      const clientSecret = paymentIntentClientSecret(upgraded);
      if (clientSecret) {
        return jsonResponse({
          ok: true,
          upgraded: true,
          client_secret: clientSecret,
          subscription_id: upgraded.id,
        });
      }

      return jsonResponse({ ok: true, upgraded: true, activated: true, subscription_id: upgraded.id });
    }

    if (shop.stripe_subscription_id) {
      try {
        const existing = await stripe.subscriptions.retrieve(shop.stripe_subscription_id);
        if (existing.status === "incomplete" || existing.status === "incomplete_expired") {
          await stripe.subscriptions.cancel(shop.stripe_subscription_id);
        } else if (existing.status === "active" && shop.subscription_tier === tier) {
          return jsonResponse({ error: "Você já possui este plano ativo." }, 400);
        }
      } catch {
        /* segue criando nova */
      }
    }

    const customer = await getOrCreateStripeCustomer(stripe, {
      email: user.email,
      shopId: shop.id,
      displayName: shop.display_name,
      existingCustomerId: shop.stripe_customer_id,
    });

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      metadata: { shop_id: shop.id, tier },
      expand: ["latest_invoice.payment_intent"],
    });

    const clientSecret = paymentIntentClientSecret(subscription);
    if (!clientSecret) {
      return jsonResponse({ error: "Stripe não retornou confirmação de pagamento." }, 502);
    }

    await supabase
      .from("barbershops")
      .update({
        stripe_customer_id: customer.id,
        stripe_subscription_id: subscription.id,
        subscription_tier: tier,
        subscription_notice: "Confirme o pagamento com cartão para ativar o plano.",
      })
      .eq("id", shop.id);

    return jsonResponse({
      ok: true,
      client_secret: clientSecret,
      subscription_id: subscription.id,
      customer_id: customer.id,
    });
  } catch (e) {
    console.error("stripe-create-subscription:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
