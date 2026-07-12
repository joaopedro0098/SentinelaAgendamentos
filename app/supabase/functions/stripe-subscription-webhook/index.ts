import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  findShopIdForStripeSubscription,
  getStripeClient,
  syncShopFromStripeSubscription,
} from "../_shared/stripePlatformBilling.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")?.trim();
  if (!webhookSecret) {
    console.error("stripe-subscription-webhook: STRIPE_WEBHOOK_SECRET ausente");
    return new Response("Webhook não configurado", { status: 500 });
  }

  try {
    const signature = req.headers.get("stripe-signature");
    if (!signature) return new Response("Assinatura ausente", { status: 400 });

    const body = await req.text();
    const stripe = getStripeClient();
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const handledTypes = new Set([
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.paid",
      "invoice.payment_failed",
    ]);

    if (!handledTypes.has(event.type)) {
      return new Response(JSON.stringify({ ok: true, ignored: event.type }), { status: 200 });
    }

    let subscription = event.data.object as { id?: string; object?: string };

    if (event.type.startsWith("invoice.")) {
      const invoice = event.data.object as { subscription?: string | null };
      const subId = typeof invoice.subscription === "string" ? invoice.subscription : null;
      if (!subId) {
        return new Response(JSON.stringify({ ok: true, ignored: "invoice_without_subscription" }), {
          status: 200,
        });
      }
      subscription = await stripe.subscriptions.retrieve(subId);
    } else {
      subscription = await stripe.subscriptions.retrieve(String(subscription.id));
    }

    const shopId = await findShopIdForStripeSubscription(supabase, subscription);
    if (!shopId) {
      console.warn("stripe-subscription-webhook: shop não encontrada", subscription.id);
      return new Response(JSON.stringify({ ok: true, ignored: "shop_not_found" }), { status: 200 });
    }

    if (event.type === "invoice.payment_failed") {
      await supabase
        .from("barbershops")
        .update({
          subscription_status: "grace",
          subscription_notice:
            "Pagamento recusado. Atualize o cartão em Conta ou tente outro meio de pagamento.",
        })
        .eq("id", shopId);
      return new Response(JSON.stringify({ ok: true, action: "payment_failed" }), { status: 200 });
    }

    await syncShopFromStripeSubscription(supabase, shopId, subscription);

    return new Response(JSON.stringify({ ok: true, action: event.type, shop_id: shopId }), { status: 200 });
  } catch (e) {
    console.error("stripe-subscription-webhook:", e);
    return new Response("Webhook error", { status: 400 });
  }
});
