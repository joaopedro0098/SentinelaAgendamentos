import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  applyStripeSubscriptionToShop,
  getStripe,
  getStripePriceId,
} from "../_shared/stripeBilling.ts";

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

function cleanUrl(value: string | null | undefined) {
  return value?.trim().replace(/\/+$/, "");
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
    const user = userData.user;

    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (isAdmin) return jsonResponse({ error: "Conta administrativa não requer assinatura." }, 400);

    const stripe = getStripe();
    const priceId = getStripePriceId();

    const { data: shop } = await supabase
      .from("barbershops")
      .select("id, display_name, stripe_customer_id, stripe_subscription_id, subscription_status")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!shop) return jsonResponse({ error: "Empresa não encontrada" }, 404);
    if (!user.email?.trim()) {
      return jsonResponse({ error: "Sua conta precisa de um e-mail válido para assinar." }, 400);
    }

    if (shop.subscription_status === "active" && shop.stripe_subscription_id) {
      return jsonResponse({ error: "Você já possui uma assinatura ativa com cartão." }, 400);
    }

    // Cliente Stripe reutilizado por barbearia (IDs de teste não existem em live e vice-versa).
    let customerId = shop.stripe_customer_id;
    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId);
      } catch {
        customerId = null;
        await supabase
          .from("barbershops")
          .update({
            stripe_customer_id: null,
            stripe_subscription_id: null,
            subscription_notice: null,
          })
          .eq("id", shop.id);
      }
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email.trim(),
        name: shop.display_name,
        metadata: { shop_id: shop.id, owner_id: user.id },
      });
      customerId = customer.id;
      await supabase.from("barbershops").update({ stripe_customer_id: customerId }).eq("id", shop.id);
    }

    // Assinatura incompleta até confirmar o cartão no Payment Element.
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent"],
      metadata: { shop_id: shop.id, owner_id: user.id },
    });

    await supabase
      .from("barbershops")
      .update({
        stripe_subscription_id: subscription.id,
        subscription_notice: "Finalize o pagamento com cartão para ativar sua assinatura.",
      })
      .eq("id", shop.id);

    const invoice = subscription.latest_invoice;
    const paymentIntent =
      invoice && typeof invoice === "object" && "payment_intent" in invoice
        ? invoice.payment_intent
        : null;

    const clientSecret =
      paymentIntent && typeof paymentIntent === "object" && "client_secret" in paymentIntent
        ? (paymentIntent.client_secret as string | null)
        : null;

    if (!clientSecret) {
      console.error("stripe-create-subscription: missing client_secret", { subscriptionId: subscription.id });
      return jsonResponse({ error: "Stripe não retornou dados para confirmar o cartão." }, 502);
    }

    const origin = cleanUrl(Deno.env.get("APP_URL")) ||
      cleanUrl(req.headers.get("origin")) ||
      "https://sentinelagendamentos.com";

    return jsonResponse({
      client_secret: clientSecret,
      subscription_id: subscription.id,
      return_url: `${origin}/app/perfil?stripe=return`,
    });
  } catch (e) {
    console.error("stripe-create-subscription:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
