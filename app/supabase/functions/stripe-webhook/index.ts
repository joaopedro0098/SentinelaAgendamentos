import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import {
  applyStripeSubscriptionToShop,
  findShopByStripeSubscription,
  getStripe,
} from "../_shared/stripeBilling.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

async function readRawBody(req: Request): Promise<string> {
  return await req.text();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const signature = req.headers.get("Stripe-Signature");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")?.trim();
    if (!signature || !webhookSecret) {
      console.error("stripe-webhook: STRIPE_WEBHOOK_SECRET ou assinatura ausente");
      return new Response("Webhook não configurado", { status: 500, headers: corsHeaders });
    }

    const stripe = getStripe();
    const body = await readRawBody(req);
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error("stripe-webhook: assinatura inválida", err);
      return new Response("Assinatura inválida", { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      const shopId = subscription.metadata?.shop_id;
      let shop = shopId
        ? (await supabase.from("barbershops").select("id").eq("id", shopId).maybeSingle()).data
        : null;

      if (!shop) {
        shop = await findShopByStripeSubscription(
          supabase,
          subscription.id,
          typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id,
        );
      }

      if (shop) {
        await applyStripeSubscriptionToShop(supabase, shop.id, subscription);
      } else {
        console.error("stripe-webhook: shop não encontrada", subscription.id);
      }
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = typeof invoice.subscription === "string"
        ? invoice.subscription
        : invoice.subscription?.id;
      if (subId) {
        const subscription = await stripe.subscriptions.retrieve(subId);
        const shop = await findShopByStripeSubscription(
          supabase,
          subscription.id,
          typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id,
        );
        if (shop) await applyStripeSubscriptionToShop(supabase, shop.id, subscription);
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("stripe-webhook:", e);
    return new Response("Erro interno", { status: 500, headers: corsHeaders });
  }
});
